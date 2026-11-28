/* ============================================================================
 *  IntMap · Atlas turn metrics — what an answer COST and HOW IT WENT, measured, never judged    (js/atlas-turn-metrics.js)
 * ----------------------------------------------------------------------------
 *  The quality of an answer is a person's judgement (production auto-evaluation is frozen). What can be measured without
 *  anyone's opinion is what this file records, one row per finished Atlas turn, so that a change to how Atlas works
 *  (a lighter context, asynchronous delegation, a search evidence store, server-side execution) can be compared on time
 *  and money while a person keeps judging the answers.
 *
 *    total_ms / first_useful_ms     the wait for the whole answer · the wait from SENDING to the first usable value, table or map actually SHOWN
 *                                   (an operation that drew or produced something, or - with none - the finished answer itself). NULL when nothing was
 *                                   shown: a turn that never produced anything usable is counted apart (useful_shown=false), never as a short wait
 *    cost_micros / cost_known       what the turn's own model calls + its workers cost; unknown when a call did not report
 *    completion / stopped           the turn's own declaration («complete» / «partial» / «none») and why the loop ended
 *    ops_*                          operations asked / executed / answered from an identical earlier call (reused) /
 *                                   refused as malformed (rejected) / refused as an unknown tool (unknown_tool)
 *    claims_total / claims_cited / claims_evidenced / claims_backing
 *                                   findings a delegation returned · those naming a source · those that ALSO hold what the source says (excerpt or raw
 *                                   values; one judgement, js/atlas-job-core.js findingBasis) · those whose source the final answer names
 *                                   (claims_grounded = claims_evidenced, kept under its old name)
 *    task_key                       the same request asked again after an unfinished try keeps the first try's key, so the cost of every attempt at one
 *                                   task is summed against its one success (the question itself is never stored)
 *    evidence_arrived_ms / evidence_used_ms   when a gathered source reached the page · when the parent began using it (markTurn)
 *    verify_*                       claims a program decided · a model decided against a source · nobody decided (js/atlas-claim-check.js). A checker's
 *                                   "supported" with no source and excerpt (js/atlas-orchestrate.js verifyOutcome `asserted`) is the model's agreement,
 *                                   not a check: it is counted in verify_unchecked, never in verify_model
 *    critical                       the one tool that took most of the turn's operation time, and its share of the wall clock
 *    model_ms / tool_ms             the wall clock split into waiting for the model and running operations
 *
 *  ⚠ NOTHING HERE IS A LIMIT AND NOTHING IS A GATE. These are numbers about what happened. The `reused` count is the figure
 *  the gate `check:atlasrepeat` is about (a second identical operation): this file reports it, it does not cap anything
 *  (.agents/rules/one-pass-or-a-reason.md §3). Rows hold counts and milliseconds only — no question, no answer, no place.
 *
 *  Pure: no DOM, no network, no globals.
 * ==========================================================================*/
import { findingBasis } from './atlas-job-core.js';
import { makeAtlasEvidence } from './atlas-evidence.js';   /* the ONE identity of an address (canonicalizeUrl): the one the answer registry and the web evidence store compare by */

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
    v.program += n0(ver.basis && ver.basis.program); v.model += n0(ver.basis && ver.basis.model); v.unchecked += n0(ver.counts && ver.counts.unchecked) + n0(ver.counts && ver.counts.asserted);
  });
  return v;
}

/* (atlas-completion-verdict) an address is ONE source by the key js/atlas-evidence.js canonicalizeUrl gives it: lower-case host, no fragment, no
   campaign parameters, no trailing slash, and THE REST OF THE QUERY KEPT, so /series?id=dem and /series?id=landcover are two sources. The rule this
   replaced dropped the whole query and accepted a prefix either way (a citation of a site's front page «backed» every page under it).
   One step is added to that key, as the rule it replaced already did: the scheme and a leading «www.» are not part of it, because the question
   here is whether the answer NAMES the same document, and a model writes https://www.x/ for a page a worker found at http://x/ (the registry and
   the store keep them apart, which is right for opening a page and harmless there). A source that is not an address (an outlet's name, a
   capability id) is its own lower-cased words, named when the answer's text holds them or a citation is exactly them — as before. */
const canon = makeAtlasEvidence().canonicalizeUrl;
const urlKey = (u) => { const c = canon(u); return c && c.ok ? c.key.replace(/^https?:\/\//, '').replace(/^www\./, '') : ''; };
const wordsKey = (u) => String(u == null ? '' : u).trim().toLowerCase();
const URL_IN_TEXT = /https?:\/\/[^\s<>"'`()[\]{}　-〿（）]+/gi;   /* an address written in the prose: up to a space, a bracket, a quote or CJK punctuation */
/* does the final answer name this source - by address in its text or among the sources it cited? */
function namesSource(source, text, cites) {
  const k = urlKey(source);
  const cited = (Array.isArray(cites) ? cites : []).map((c) => (c && typeof c === 'object' ? c.url : c));
  if (!k) {   /* not an address */
    const w = wordsKey(source);
    return !!w && (wordsKey(text).includes(w) || cited.some((c) => wordsKey(c) === w));
  }
  if ((String(text == null ? '' : text).match(URL_IN_TEXT) || []).some((u) => urlKey(u.replace(/[.,;:!?]+$/, '')) === k)) return true;
  return cited.some((c) => urlKey(c) === k);
}
const optMs = (v) => (v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null);

/* buildTurnMetrics(out, timing) -> the row.  out: what runTurn returned.  timing: { totalMs?, firstUsefulMs?, taskKey?, marks?, cites? } measured by the caller. */
export function buildTurnMetrics(out, timing) {
  const o = out || {}, t = timing || {};
  const run = o.run || {}, tr = o.trace || {};
  const wall = optMs(t.totalMs) ?? n0(run.wallMs);
  const tools = Array.isArray(run.tools) ? run.tools.filter((x) => x && x.id !== 'unknown') : [];
  const toolMs = tools.reduce((m, x) => m + n0(x.ms), 0);
  const slow = tools.reduce((b, x) => (!b || n0(x.ms) > n0(b.ms) ? x : b), null);
  const fs = findingsOf(o.results);
  const basis = fs.map(findingBasis);
  const evidenced = basis.filter((b) => b.evidenced);
  const backing = evidenced.filter((b) => namesSource(b.source, o.text, t.cites)).length;
  const ver = verificationOf(o.results);
  const first = optMs(t.firstUsefulMs);
  const marks = t.marks || {};
  const delegations = new Map();
  let detachedJob = false;
  (Array.isArray(o.results) ? o.results : []).forEach((r) => {
    const job = r?.details?.job;
    if (job?.created || job?.resumed) detachedJob = true;
    const d = r?.delegated || r?.meta?.delegated;
    if (!Array.isArray(d)) return;
    const group = r.details?.delegationRun || r.details?.resume?.key || r.id;
    d.forEach((x) => { if (x?.id) delegations.set(group + ':' + x.id, x); });
  });
  const delegated = Array.from(delegations.values());
  return {
    total_ms: wall,
    first_useful_ms: first, useful_shown: first !== null,
    model_calls: n0(run.modelCalls), provider_call_ids: run.providerCallIds || [], model_ms: n0(run.modelMs), tool_ms: toolMs,
    cost_micros: Math.round((Number(run.costUsd) || 0) * 1e6), cost_known: !n0(run.costUnknownCalls) && !n0(run.unpricedCalls),
    pending_delegation: detachedJob || t.pendingDelegation === true || delegated.some((x) => x.state === 'running'),
    delegated_cost_micros: Math.round((Number(run.delegatedCostUsd) || 0) * 1e6), delegated_tasks: n0(run.delegatedTasks),
    delegated_model_tasks: delegated.filter((x) => !x.resumed && n0(x.calls) > 0).length,
    completion: ['complete', 'partial', 'none'].indexOf(o.completion) >= 0 ? o.completion : 'none',
    stopped: String(o.stopped || '').slice(0, 40),
    ops_asked: n0(tr.calls), ops_executed: n0(tr.executed), ops_reused: n0(tr.reused), ops_rejected: n0(tr.rejected), ops_unknown_tool: n0(tr.unknownTool),
    claims_total: fs.length, claims_cited: basis.filter((b) => b.cited).length, claims_evidenced: evidenced.length, claims_backing: backing, claims_grounded: evidenced.length,
    verify_program: ver.program, verify_model: ver.model, verify_unchecked: ver.unchecked,
    critical_tool: slow ? String(slow.id).slice(0, 80) : '', critical_ms: slow ? n0(slow.ms) : 0,
    task_key: t.taskKey ? String(t.taskKey).slice(0, 120) : null,
    evidence_arrived_ms: optMs(marks.evidence_arrived), evidence_used_ms: optMs(marks.evidence_used),
  };
}

/* isUsefulResult(r) - did this operation put a usable value, table or map in front of the reader?  `r` is the page's per-operation record
   ({ ok, meta:{ produced }, drew }): what the kernel observed it PRODUCE (route, map, panel...) or what was seen DRAWN. A refusal, a failure, a note
   (re-read ev1) and a plan produce neither. */
function isUsefulResult(r) {
  if (!r || r.ok === false || r.meta?.modelOnly) return false;
  const produced = r.meta && Array.isArray(r.meta.produced) ? r.meta.produced : [];
  return produced.length > 0 || (Array.isArray(r.drew) && r.drew.some((d) => d && d.visible !== false));
}

/* what one SUCCESS cost: every attempt at the same task - the failed and the repeated ones included - over the tasks that succeeded. A row without a
   task_key is its own task. An attempt whose cost was not fully reported adds what was reported (a floor); cost_traced_rate says how many were. */
function costPerSuccess(r) {
  const tasks = new Map();
  r.forEach((x, i) => { const k = x.task_key || x.turn_key || ('row' + i); const e = tasks.get(k) || { cost: 0, ok: false }; e.cost += Number(x.cost_micros) || 0; if (x.completion === 'complete') e.ok = true; tasks.set(k, e); });
  const all = Array.from(tasks.values());
  const won = all.filter((e) => e.ok);
  return won.length ? all.reduce((m, e) => m + e.cost, 0) / won.length : null;
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
    no_useful_rate: ratio(r.filter((x) => x.first_useful_ms == null).length, r.length),   /* the turns that showed nothing usable: counted here, never as a short wait above */
    completion_rate: ratio(complete.length, r.length),
    cost_per_success_micros: costPerSuccess(r),
    cost_traced_rate: ratio(r.filter((x) => x.cost_known).length, r.length),   /* the share of turns whose whole cost was reported */
    cost_per_turn_micros: ratio(totalCost, costKnown.length),
    capability_found_rate: ratio(sum('ops_asked') - sum('ops_unknown_tool'), sum('ops_asked')),
    duplicate_op_rate: ratio(sum('ops_reused'), sum('ops_asked')),
    grounded_claim_rate: ratio(sum('claims_grounded'), sum('claims_total')),
    cited_claim_rate: ratio(sum('claims_cited'), sum('claims_total')),
    evidenced_claim_rate: ratio(sum('claims_evidenced'), sum('claims_total')),
    backing_claim_rate: ratio(sum('claims_backing'), sum('claims_total')),
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

/* -- one recorder per turn; the page's other parts reach the running one through markTurn / reportShown, never by holding it ---- */
let active = null;
/* markTurn(name) - "the evidence arrived" / "the parent began using it": the milliseconds since the turn was sent are kept under `name` the first time only
   (a moment, not a counter). A caller with no turn running changes nothing. The row carries evidence_arrived and evidence_used. */
export function markTurn(name, turn) { try { if (active && active.turn === String(turn || '')) active.mark(name); } catch (_) { /* telemetry */ } }
/* reportShown(result) - an operation's record, as the page is about to show it (js/atlas-console.js dispatch) */
export function reportShown(result, turn) { try { if (active && active.turn === String(turn || '')) active.shown(result); } catch (_) { /* telemetry */ } }

/* the same request, asked again after an unfinished try, is ONE task: its key is the first try's. Held in memory (the question is compared, never stored). */
const lastTask = { q: '', key: '', done: true };

/* makeTurnRecorder({ now, emit, question, turnKey }) - one per turn. `shown(result)` is told of every operation the page shows; the first that
   isUsefulResult() is "the wait for the first useful result", measured from the moment this recorder was made (the send). `recordAnswer(out, turnKey, { cites })`
   builds the row and announces it (`emit`, by default the bus event the sink above hears); `recordFailure(error, turnKey)` does the same for a turn that
   ended without an answer, so what it cost is counted against its task. Both return the row. */
export function makeTurnRecorder(opt) {
  const o = opt || {};
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  const emit = typeof o.emit === 'function' ? o.emit
    : (detail) => { try { bus.emit(TURN_METRICS_EVENT, detail); } catch (_) { /* telemetry */ } };
  const t0 = o.startedAt ?? now();
  const marks = {};
  let first = null, announced = false;
  const q = String(o.question || '').trim();
  const taskKey = q && !lastTask.done && lastTask.q === q ? lastTask.key : String(o.turnKey || '');
  if (q) { lastTask.q = q; lastTask.key = taskKey; lastTask.done = false; }
  const rec = {
    turn: String(o.turnKey || ''),
    useful() { if (first === null) first = Math.max(0, now() - t0); },
    step() { /* a step starting is not a result */ },
    shown(r) { if (isUsefulResult(r)) rec.useful(); },
    mark(name) { const k = String(name || '').slice(0, 40); if (k && marks[k] === undefined) marks[k] = Math.max(0, now() - t0); },
    row(out, extra) {
      const total = now() - t0;
      const o2 = out || {};
      /* a turn that showed no operation's result but finished with an answer showed the reader that answer */
      const f = first !== null ? first : (extra?.displayed !== false && o2.completion === 'complete' && String(o2.text || '').trim() ? total : null);
      return buildTurnMetrics(out, { totalMs: total, firstUsefulMs: f, taskKey, marks, cites: extra && extra.cites });
    },
    recordAnswer(out, turnKey, extra) {
      const turn = String(turnKey || '').trim();
      const row = this.row(out, extra);
      if (q && active === rec) lastTask.done = row.completion === 'complete';
      if (active === rec) active = null;
      if (turn && !announced) { announced = true; emit({ turn, row }); }
      return out?.run?.stages?.length ? { ...row, effortStages: out.run.stages } : row;
    },
    recordFailure(error, turnKey, run) {
      if (announced) return null;
      const row = this.row({ run, completion: 'none', stopped: String((error && error.code) || 'error') }, null);
      if (active === rec) active = null;
      const turn = String(turnKey || '').trim();
      if (turn && !announced) { announced = true; emit({ turn, row }); }
      return row;
    },
  };
  active = rec;
  return rec;
}
