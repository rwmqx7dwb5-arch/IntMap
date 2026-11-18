// ============================================================================
//  IntMap · _shared/ai-ledger.js — every AI call a reader causes goes through ONE ledger  (ai-one-ledger)
// ----------------------------------------------------------------------------
//  WHAT WAS FOUND (audit, 2026-09-29):
//    ① the area-monitor runner's «Run now» (since retired) called the provider on the server's key and
//       never touched the reader's AI allowance. ai-proxy charged `consume_ai_turn`; the runner charged
//       nothing, so one free account with its five monitors could start 5 × 120 = 600 manual
//       runs an hour (30 s cooldown per monitor), each allowed to call the provider,
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
//  ai-proxy calls these (the retired area-monitor runner did too); it spells no limit or RPC of the
//  ledger itself.
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
   consume_ai_turn's own rule. `maxCalls` and `ttlSeconds` are the CALLER's (a turn's bounds are
   the caller's to state); the database clamps both. */
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
    /* (security-review-nov) the generation of the turn row this attempt opened — handed back to
       settleTurn / refundTurn so a late close cannot land on a row made again under the same key */
    gen: typeof row.gen === "string" && row.gen ? row.gen : null,
  };
}

/* (atlas-delegation) openChildTurn — a worker's call under a live parent turn (public.consume_ai_child_turn).
     → { allowed, charged:false, used, calls, children, reason, gen }
     reason '' | 'delegation_key' | 'delegation_parent' | 'delegation_children' | 'turn_calls'
   Never a charge: the parent's first call paid for the request. The developer, exempt from the ledger,
   opens nothing (as openTurn). Closes through settleTurn / refundTurn with the child's own key. */
export async function openChildTurn(db, account, o) {
  const opt = o || {};
  if (account && account.isDev) return { allowed: true, charged: false, used: 0, calls: 0, children: 0, reason: "", gen: null };
  let row = null;
  try {
    const { data, error } = await db.rpc("consume_ai_child_turn", {
      p_user: account.id, p_parent: String(opt.parent || ""), p_child: String(opt.turn || ""),
      p_max_children: opt.maxChildren, p_max_calls: opt.maxCalls, p_ttl_seconds: opt.ttlSeconds,
    });
    if (error) throw error;
    row = firstRow(data);
  } catch (_) { throw new LedgerUnavailable(); }
  if (!row) throw new LedgerUnavailable();
  return {
    allowed: !!row.allowed, charged: false,
    used: Number(row.used) || 0, calls: Number(row.calls) || 0, children: Number(row.children) || 0,
    reason: row.allowed ? "" : String(row.reason || "delegation_refused"),
    gen: typeof row.gen === "string" && row.gen ? row.gen : null,
  };
}

/* (atlas-delegation) reserveSpend — hold an estimated cost against a turn family's cap (public.reserve_ai_spend).
     → { allowed, reserved, spent }  (micro-dollars). Throws LedgerUnavailable: an invoice fence that cannot be
   consulted cannot say the request is inside it (the direction every fence here fails in). */
export async function reserveSpend(db, account, o) {
  const opt = o || {};
  if (account && account.isDev) return { allowed: true, reserved: 0, spent: 0 };
  let row = null;
  try {
    const { data, error } = await db.rpc("reserve_ai_spend", {
      p_user: account.id, p_root: String(opt.root || ""), p_micros: Math.max(0, Math.ceil(Number(opt.micros) || 0)),
      p_cap_micros: Math.max(0, Math.floor(Number(opt.capMicros) || 0)), p_ttl_seconds: opt.ttlSeconds,
    });
    if (error) throw error;
    row = firstRow(data);
  } catch (_) { throw new LedgerUnavailable(); }
  if (!row) throw new LedgerUnavailable();
  return { allowed: !!row.allowed, reserved: Number(row.reserved_micros) || 0, spent: Number(row.spent_micros) || 0 };
}

/* (atlas-delegation) settleSpend — replace a reservation with what was billed. → 'settled' | 'not_found' | 'error' | 'skipped'.
   Not retried: an unsettled reservation over-counts until the family's row expires, and over-counting is the safe side. */
export async function settleSpend(db, account, root, reservedMicros, actualMicros) {
  if (!account || account.isDev || !root) return "skipped";
  try {
    const { data, error } = await db.rpc("settle_ai_spend", {
      p_user: account.id, p_root: String(root), p_reserved: Math.max(0, Math.ceil(Number(reservedMicros) || 0)),
      p_actual: Math.max(0, Math.ceil(Number(actualMicros) || 0)),
    });
    if (error) return "error";
    const v = Array.isArray(data) ? data[0] : data;
    return v === true ? "settled" : (v === false ? "not_found" : "error");
  } catch (_) { return "error"; }
}

/* (security-review-nov) WHAT A CLOSE ANSWERED. supabase-js reports a database error as a RESOLVED
   { data, error } — it does not throw — so «no exception» is not «done». Before this, both doors said true
   for an RPC that had failed, and settle said true for a turn that matched no row. Each door now answers
   a status the caller can record (never the database message: PostgREST errors name the schema):
     refundTurn → 'refunded' | 'held' | 'answered' | 'not_found' | 'error' | 'skipped'
     settleTurn → 'settled'  | 'not_found' | 'error' | 'skipped'
   ⚠ Neither is retried here. A refund that failed is not asked again blindly: a turn-less refund
   (empty key) has no row to make it idempotent, and a turn's row may have been released already.
   The turn's row expires with its TTL (consume_ai_turn), which is the recovery path. */
const REFUND_STATES = new Set(["refunded", "held", "answered", "not_found"]);

/* refundTurn — an attempt of a turn closed without an answer (public.refund_ai_turn). The ledger gives
   the charge back only when the LAST attempt of the turn closes without one (#R801, security-review-nov). */
export async function refundTurn(db, account, turn, gen) {
  if (!account || account.isDev) return "skipped";
  try {
    const args = { p_user: account.id, p_turn: String(turn || "") };
    if (gen) args.p_gen = String(gen);
    const { data, error } = await db.rpc("refund_ai_turn", args);
    if (error) return "error";
    const v = String(firstRow(data) ?? "");
    return REFUND_STATES.has(v) ? v : "error";
  } catch (_) { return "error"; }
}

/* settleTurn — the turn has produced an answer, so no later failure under its key can refund it. */
export async function settleTurn(db, account, turn, gen) {
  if (!account || account.isDev || !turn) return "skipped";
  try {
    const args = { p_user: account.id, p_turn: String(turn) };
    if (gen) args.p_gen = String(gen);
    const { data, error } = await db.rpc("settle_ai_turn", args);
    if (error) return "error";
    const v = Array.isArray(data) ? data[0] : data;   /* a boolean — firstRow would read `false` as «no row» */
    return v === true ? "settled" : (v === false ? "not_found" : "error");
  } catch (_) { return "error"; }
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

/* ══ (atlas-turn-observability) HOW THE REQUESTS WENT — one anonymous count per fact, in the counter that already exists ══
   The ledger above says what a request COST and whether the reader was charged; nothing said how it WENT:
   how long it took, how many provider requests it needed, whether the model answering was the one asked
   for, whether the answer ended. A slow week, a model that quietly stopped being reachable, a ladder
   that walks every request down three rungs — none of it was visible until a reader said so.
   ⚠ THIS OBSERVES; IT DECIDES NOTHING. No request is refused, shortened, retried or re-routed because of
   a number written here (CONSTITUTION.md §5; .agents/rules/one-pass-or-a-reason.md §1), and the write is
   best-effort and off the answer's path — a measurement that fails must not fail the answer it measures.
   ⚠ NO PERSON IN IT. Rows are (UTC day, metric, dimension) += n in public.usage_counts — the same
   anonymous, admin-only counter the page's own counts go to (docs/MONITORING.md §2b); no user, turn key,
   prompt, model output or address is an argument. Every dimension is a closed word from this file, a
   typed error code, or a model name from the server's own configuration, shaped to the table's CHECK.
   Metrics (ai_ prefix; the browser cannot write them — usage-count validates against shape.js):
     ai_request    outcome: "ok", or the typed error code the request ended in ("provider_unavailable", …)
     ai_wall       wall-clock of the request, in ranges
     ai_rungs      provider requests the ONE request needed (1 = no ladder; 2+ = it walked down)
     ai_fallback   the model the chain walked TO (providers/openai.ts FALLBACK_CHAIN), when it walked — never inferred from the
                   provider's reported model name, which is a dated snapshot of the one asked for and differs every time
     ai_incomplete the provider's own reason, when the answer did not end */
export const HEALTH_WALL_BUCKETS = Object.freeze([[5000, "lt5s"], [15000, "5to15s"], [30000, "15to30s"], [60000, "30to60s"], [120000, "60to120s"]]);
const HEALTH_CAP = 32;   /* distinct dimensions per metric per day — outcomes and models are a handful; the table bounds the rest */
const dimOf = (v) => String(v == null ? "" : v).replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[^A-Za-z0-9]+/, "").slice(0, 64);
export function healthRows(ev) {
  const e = ev || {};
  const rows = [];
  const add = (m, d) => { const dim = dimOf(d); if (dim) rows.push({ m, d: dim, n: 1, cap: HEALTH_CAP }); };
  add("ai_request", e.outcome || "ok");
  const ms = Math.max(0, Math.floor(Number(e.wallMs) || 0));
  const b = HEALTH_WALL_BUCKETS.find(([top]) => ms < top);
  add("ai_wall", b ? b[1] : "ge120s");
  const rungs = Math.max(0, Math.floor(Number(e.attempts) || 0));
  if (rungs > 0) add("ai_rungs", rungs >= 6 ? "6plus" : String(rungs));
  if (e.fallbackTo) add("ai_fallback", e.fallbackTo);
  if (e.incomplete) add("ai_incomplete", e.incomplete);
  return rows;
}
export function recordHealth(db, ev) {
  const rows = healthRows(ev);
  if (!rows.length) return Promise.resolve(false);
  const p = (async () => {
    try { const { error } = await db.rpc("record_usage_counts", { p_rows: rows }); return !error; }
    catch (_) { return false; }
  })();
  const rt = globalThis.EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") {
    try { rt.waitUntil(p); return Promise.resolve(true); } catch (_) { /* fall through: await it */ }
  }
  return p;
}
