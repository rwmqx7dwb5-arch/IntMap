// ============================================================================
//  IntMap · ai-proxy · replay — the held answer of a keyed Atlas request (atlas-stream-replay)
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. What the leases are and why: config.ts,
//  above ANSWER_LEASE_S. Who calls these and when: ask.ts.
// ============================================================================

import { TURN_TTL_S, ANSWER_LEASE_S, ANSWER_POLL_MS } from "./config.ts";

/* ══ (atlas-stream-replay) THE HELD ANSWER'S FOUR DOORS — see ANSWER_LEASE_S for what they are for ═══
   Each returns null / false when the ledger does not answer, and the caller then behaves exactly as
   before this file held answers (the request runs). A replay that cannot be looked up is not a
   replay that was refused — and the run that follows still says what it was (meta.replay). */
export type HeldAnswer = { state: string; attempts: number; status: number; body: Record<string, unknown> | null };
export type Claim = { outcome: string; attempts: number; status: number; body: Record<string, unknown> | null; after: string };
// deno-lint-ignore no-explicit-any
export type Db = { rpc: (fn: string, args: Record<string, unknown>) => any };
export const firstOf = (data: unknown) => (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
export async function peekAnswer(db: Db, user: string, turn: string, key: string): Promise<HeldAnswer | null> {
  try {
    const { data, error } = await db.rpc("peek_ai_answer", { p_user: user, p_turn: turn, p_key: key });
    if (error) return null;
    const row = firstOf(data);
    if (!row || typeof row.state !== "string") return null;
    return { state: row.state, attempts: Number(row.attempts) || 1, status: Number(row.status) || 0, body: (row.body && typeof row.body === "object") ? row.body as Record<string, unknown> : null };
  } catch (_) { return null; }
}
export async function claimAnswer(db: Db, user: string, turn: string, key: string): Promise<Claim | null> {
  try {
    const { data, error } = await db.rpc("claim_ai_answer", { p_user: user, p_turn: turn, p_key: key, p_ttl_seconds: TURN_TTL_S, p_lease_seconds: ANSWER_LEASE_S });
    if (error) return null;
    const row = firstOf(data);
    if (!row || typeof row.outcome !== "string") return null;
    return { outcome: row.outcome, attempts: Number(row.attempts) || 1, status: Number(row.status) || 0, body: (row.body && typeof row.body === "object") ? row.body as Record<string, unknown> : null, after: String(row.after_state || "") };
  } catch (_) { return null; }
}
export async function beatAnswer(db: Db, user: string, turn: string, key: string, attempt: number): Promise<void> {
  try { await db.rpc("beat_ai_answer", { p_user: user, p_turn: turn, p_key: key, p_attempt: attempt, p_lease_seconds: ANSWER_LEASE_S }); } catch (_) { /* the lease runs out; a retry then re-runs */ }
}
export async function finishAnswer(db: Db, user: string, turn: string, key: string, attempt: number, a: { status: number; body: Record<string, unknown> }): Promise<boolean> {
  try {
    const ok = a.status === 200;
    const { error } = await db.rpc("finish_ai_answer", { p_user: user, p_turn: turn, p_key: key, p_attempt: attempt, p_ok: ok, p_status: a.status, p_body: ok ? a.body : null });
    return !error;
  } catch (_) { return false; }
}
/* A retry that found the first request still running waits for it — reading the row, never running
   the request. It returns what the row last said: done, failed, abandoned, or null (nothing there). */
export async function awaitAnswer(db: Db, user: string, turn: string, key: string): Promise<HeldAnswer | null> {
  for (;;) {
    const s = await peekAnswer(db, user, turn, key);
    if (!s || s.state !== "running") return s;
    await new Promise((r) => setTimeout(r, ANSWER_POLL_MS));
  }
}
/* The stored answer, as THIS request's answer: it charged nothing (`charged` false), it did not
   travel as a stream, and it says it is a replay and of which run. Everything else is the first
   request's body byte for byte — the same text, the same items, the same citations. */
export function replayed(status: number, body: Record<string, unknown>, attempts: number): { status: number; body: Record<string, unknown> } {
  const meta = (body.meta && typeof body.meta === "object") ? { ...(body.meta as Record<string, unknown>) } : {};
  delete meta.streamed;
  meta.replay = { kind: "replayed", attempts };
  return { status: status || 200, body: { ...body, charged: false, meta } };
}
