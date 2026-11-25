/* ============================================================================
 *  IntMap · Atlas turn metrics — what an answer COST and HOW IT WENT, measured, never judged    (js/atlas-turn-metrics.js)
 * ----------------------------------------------------------------------------
 *  The quality of an answer is a person's judgement (production auto-evaluation is frozen). What can be measured without
 *  anyone's opinion is what this file records, one row per finished Atlas turn, so that a change to how Atlas works
 *  (a lighter context, asynchronous delegation, a search evidence store, server-side execution) can be compared on time
 *  and money while a person keeps judging the answers.
 *
 *    total_ms / first_useful_ms     the wait for the whole answer · the wait for the first operation that produced a result
 *    cost_micros / cost_known       what the turn's own model calls + its workers cost; unknown when a call did not report
 *    completion / stopped           the turn's own declaration («complete» / «partial» / «none») and why the loop ended
 *    ops_*                          operations asked / executed / answered from an identical earlier call (reused) /
 *                                   refused as malformed (rejected) / refused as an unknown tool (unknown_tool)
 *    claims_total / claims_grounded findings a delegation returned · the ones that carry a source
 *    verify_*                       claims a program decided · a model decided · nobody decided (js/atlas-claim-check.js)
 *    critical                       the one tool that took most of the turn's operation time, and its share of the wall clock
 *    model_ms / tool_ms             the wall clock split into waiting for the model and running operations
 *
 *  ⚠ NOTHING HERE IS A LIMIT AND NOTHING IS A GATE. These are numbers about what happened. The `reused` count is the figure
 *  the gate `check:atlasrepeat` is about (a second identical operation): this file reports it, it does not cap anything
 *  (.agents/rules/one-pass-or-a-reason.md §3). Rows hold counts and milliseconds only — no question, no answer, no place.
 *
 *  Pure: no DOM, no network, no globals.
 * ==========================================================================*/
const n0 = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.round(x) : 0; };

function findingsOf(results) {
  const out = [];
  (Array.isArray(results) ? results : []).forEach((rec) => {
    const m = rec && (rec.meta || rec);
    ((m && m.delegated) || []).forEach((d) => (d && Array.isArray(d.findings) ? d.findings : []).forEach((f) => out.push(f)));
  });
  return out;
}
function verificationOf(results) {
  const v = { program: 0, model: 0, unchecked: 0 };
  (Array.isArray(results) ? results : []).forEach((rec) => {
    const m = rec && (rec.meta || rec);
    const ver = m && m.integrated && m.integrated.verification;
    if (!ver) return;
    v.program += n0(ver.basis && ver.basis.program); v.model += n0(ver.basis && ver.basis.model); v.unchecked += n0(ver.counts && ver.counts.unchecked);
  });
  return v;
}

/* buildTurnMetrics(out, timing) → the row.  out: what runTurn returned.  timing: { totalMs?, firstUsefulMs? } measured by the caller. */
export function buildTurnMetrics(out, timing) {
  const o = out || {}, t = timing || {};
  const run = o.run || {}, tr = o.trace || {};
  const wall = n0(t.totalMs) || n0(run.wallMs);
  const tools = Array.isArray(run.tools) ? run.tools.filter((x) => x && x.id !== 'unknown') : [];
  const toolMs = tools.reduce((m, x) => m + n0(x.ms), 0);
  const slow = tools.reduce((b, x) => (!b || n0(x.ms) > n0(b.ms) ? x : b), null);
  const fs = findingsOf(o.results);
  const grounded = fs.filter((f) => f && (f.source || f.url || (Array.isArray(f.sources) && f.sources.length))).length;
  const ver = verificationOf(o.results);
  return {
    total_ms: wall,
    first_useful_ms: Number.isFinite(Number(t.firstUsefulMs)) && Number(t.firstUsefulMs) >= 0 ? Math.round(Number(t.firstUsefulMs)) : null,
    model_calls: n0(run.modelCalls), model_ms: n0(run.modelMs), tool_ms: toolMs,
    cost_micros: Math.round((Number(run.costUsd) || 0) * 1e6), cost_known: !n0(run.costUnknownCalls),
    delegated_cost_micros: Math.round((Number(run.delegatedCostUsd) || 0) * 1e6), delegated_tasks: n0(run.delegatedTasks),
    completion: ['complete', 'partial', 'none'].indexOf(o.completion) >= 0 ? o.completion : 'none',
    stopped: String(o.stopped || '').slice(0, 40),
    ops_asked: n0(tr.calls), ops_executed: n0(tr.executed), ops_reused: n0(tr.reused), ops_rejected: n0(tr.rejected), ops_unknown_tool: n0(tr.unknownTool),
    claims_total: fs.length, claims_grounded: grounded,
    verify_program: ver.program, verify_model: ver.model, verify_unchecked: ver.unchecked,
    critical_tool: slow ? String(slow.id).slice(0, 80) : '', critical_ms: slow ? n0(slow.ms) : 0,
  };
}

/* summarize(rows) → the figures a comparison needs, from rows shaped as buildTurnMetrics returns (or read back from the table).
   A ratio whose denominator is zero is null (not 0, not 1): «nothing to measure» is not a result. */
export function summarize(rows) {
  const r = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const sum = (k) => r.reduce((m, x) => m + (Number(x[k]) || 0), 0);
  const ratio = (a, b) => (b > 0 ? a / b : null);
  const pct = (arr, p) => { const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  const complete = r.filter((x) => x.completion === 'complete');
  const costKnown = r.filter((x) => x.cost_known);
  const totalCost = costKnown.reduce((m, x) => m + (Number(x.cost_micros) || 0), 0);
  return {
    turns: r.length,
    total_ms: { p50: pct(r.map((x) => Number(x.total_ms)), 0.5), p90: pct(r.map((x) => Number(x.total_ms)), 0.9) },
    first_useful_ms: { p50: pct(r.map((x) => (x.first_useful_ms == null ? NaN : Number(x.first_useful_ms))), 0.5), p90: pct(r.map((x) => (x.first_useful_ms == null ? NaN : Number(x.first_useful_ms))), 0.9) },
    completion_rate: ratio(complete.length, r.length),
    cost_per_success_micros: ratio(complete.filter((x) => x.cost_known).reduce((m, x) => m + (Number(x.cost_micros) || 0), 0), complete.filter((x) => x.cost_known).length),
    cost_per_turn_micros: ratio(totalCost, costKnown.length),
    capability_found_rate: ratio(sum('ops_asked') - sum('ops_unknown_tool'), sum('ops_asked')),
    duplicate_op_rate: ratio(sum('ops_reused'), sum('ops_asked')),
    grounded_claim_rate: ratio(sum('claims_grounded'), sum('claims_total')),
    program_verified_share: ratio(sum('verify_program'), sum('verify_program') + sum('verify_model')),
    model_wait_share: ratio(sum('model_ms'), sum('total_ms')),
    critical_tools: (() => { const m = new Map(); r.forEach((x) => { if (x.critical_tool) m.set(x.critical_tool, (m.get(x.critical_tool) || 0) + (Number(x.critical_ms) || 0)); }); return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tool, ms]) => ({ tool, ms })); })(),
  };
}

import * as bus from './bus.js';

/* ── the page's two halves, joined by an event on the app's bus (js/bus.js) ──────────────────────────────────────
   The Atlas console only ANNOUNCES a finished answer's row; this file's listener is what writes it. A control's handler therefore does not
   reach a database write (scripts/data-effects.mjs): recording is telemetry about the turn that ran, not an effect of a button. */
export const TURN_METRICS_EVENT = 'intmap-atlas-turn-metrics';   /* declared in js/bus.js */

/* installTurnMetricsSink(listen, db) — `listen(name, fn)` (the bus's `on`) and write each announced row through log_atlas_turn_metrics. `db` returns the signed-in
   Supabase client (null: a signed-out reader records nothing). A failed write is swallowed and NOT retried: nothing observed failed in the
   reader's turn (one-pass-or-a-reason §5), and the record is never the answer's problem. */
export function installTurnMetricsSink(listen, db) {
  if (typeof listen !== 'function') return null;
  const onRow = (e) => {
    const d = e && e.detail, key = String((d && d.turn) || '').trim(), sb = typeof db === 'function' ? db() : null;
    if (!key || !d.row || !sb || typeof sb.rpc !== 'function') return;
    try { Promise.resolve(sb.rpc('log_atlas_turn_metrics', { p_turn: key, p_row: d.row })).catch(() => {}); } catch (_) { /* never the answer's problem */ }
  };
  listen(TURN_METRICS_EVENT, onRow);
  return onRow;
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') installTurnMetricsSink(bus.on, () => window.sb || null);

/* makeTurnRecorder({ now, notWork, emit }) — one per turn. `step(s)` is handed every step the loop reports at its START ({ step, calls:[names] });
   a step that asked for an operation (a name not in `notWork` — the plan tool is bookkeeping, not work) has finished when the NEXT step starts, and
   that moment is «the wait for the first useful result». `recordAnswer(out, turnKey)` builds the row and announces it (`emit`, by default the bus event the sink above hears) — it returns the row. */
export function makeTurnRecorder(opt) {
  const o = opt || {};
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  const skip = new Set((Array.isArray(o.notWork) ? o.notWork : []).filter(Boolean));
  const emit = typeof o.emit === 'function' ? o.emit
    : (detail) => { try { bus.emit(TURN_METRICS_EVENT, detail); } catch (_) { /* telemetry */ } };
  const t0 = now();
  let first = null, pendingWork = false;
  const worked = (s) => !!(s && Array.isArray(s.calls) && s.calls.some((n) => n && !skip.has(n)));
  return {
    step(s) { if (pendingWork && first === null) first = now() - t0; pendingWork = worked(s); },
    row(out) { if (pendingWork && first === null && out && out.trace && Number(out.trace.executed) > 0) first = now() - t0; return buildTurnMetrics(out, { totalMs: now() - t0, firstUsefulMs: first }); },
    recordAnswer(out, turnKey) {
      const turn = String(turnKey || '').trim();
      const row = this.row(out);
      if (turn) emit({ turn, row });
      return row;
    },
  };
}
