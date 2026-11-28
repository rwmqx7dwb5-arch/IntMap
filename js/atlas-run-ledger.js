/* ============================================================================
 *  IntMap · js/atlas-run-ledger.js — what ONE finished piece of work cost, in one record   (job-cost-ledger)
 * ----------------------------------------------------------------------------
 *  WHAT WAS MISSING (2026-11-20 survey): the proxy prices every provider request (`meta.costUsd`,
 *  `meta.modelServed`) and the turn loop measures its own steps, but nothing added them up for the unit a
 *  reader thinks in — «this question». The cost of an answer, the time it took, which models answered and which
 *  tools ran were four facts in four places, and the delegated workers' cost was a fifth that only the delegation
 *  card showed. Without that sum there is nothing to choose a cheaper way of doing the same work BY.
 *
 *  WHAT THIS FILE OWNS — pure functions, no DOM, no network, no clock of its own (`now` is injected):
 *    · makeRunLedger({ now }) — .model(call) per provider answer, .tool(call) per tool run, .summary().
 *    · runLine(summary, L)    — one quiet sentence for the reader.
 *    · makeRunHistory(max)    — the last N summaries, so a later view can compare runs.
 *
 *  ⚠ NOT OBSERVED IS NOT FREE (one-pass-or-a-reason §5). A provider answer that carried no `costUsd` is COUNTED in
 *    `costUnknownCalls` and is not added as zero; the line says so instead of printing a total that looks complete.
 *  ⚠ IT OBSERVES AND NEVER DECIDES. It does not pick a model, cut a step or refuse a call — the model and the
 *    reader decide; this is the record they decide from (CONSTITUTION §5: no new limits on Atlas).
 * ============================================================================ */

const num = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
const str = (v, n) => String(v == null ? '' : v).slice(0, n || 80);

export function proxyUsage(meta) {
  return meta ? { model: meta.modelServed || meta.model, costUsd: typeof meta.costUsd === 'number' ? meta.costUsd : undefined,
    priceKnown: meta.priceKnown } : undefined;
}

/* peakConcurrency(spans) — the most intervals [start,end) alive at one instant. Sweep over the ends: a span that ends where another begins does not overlap it. */
export function peakConcurrency(spans) {
  const ev = [];
  (Array.isArray(spans) ? spans : []).forEach((s) => { if (s && Number.isFinite(s[0]) && Number.isFinite(s[1])) { ev.push([s[0], 1]); ev.push([s[1], -1]); } });
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);   /* at a tie the end (-1) comes first */
  let cur = 0, peak = 0;
  ev.forEach((e) => { cur += e[1]; if (cur > peak) peak = cur; });
  return peak;
}

/* lateCostSink — where the cost of a worker that ENDS AFTER the answer which left it running is reported. A `wait:"any"` delegation answers with the first
   arrival and leaves the rest running; the turn's ledger summed only what each answer carried, so a slow worker's cost (it was paid) never reached the turn's
   record unless the model asked again. The loop sets `current` to its ledger's `late` for the turn it runs; a delegation reads `current` WHEN IT RETURNS EARLY
   (so a later turn's sink is never handed this turn's cost) and calls it when each still-running worker ends. */
export const lateCostSink = { current: null };

/* ══ (atlas-child-loop-reuse) WHEN THE FIRST USABLE DATA ARRIVED, AND WHAT THE PARENT DID WITH IT ═══════════════════════════════════════════════
   The external audit (2026-11-27) asked whether the parent waits for every call of a reply when the next computation was already decided —
   and nothing recorded the instants that question is answered by. The ledger now keeps them, each the FIRST time it happens in the turn, in
   ms from the turn's start: `firstUsefulData` (a delegated task ended done/partial — reported through `runMarkSink`, read by a delegation
   the way lateCostSink is), `parentReceived` (a tool that delegated returned to the loop), `nextAnalysisStart` (the first model request
   after that). With `wallMs` (all done) and `costUsd` they are the five figures a change to the waiting is compared by, on the SAME question.
   It observes and never decides: no call waits, starts or stops because of it. */
export const runMarkSink = { current: null };

const turnLedgers = new Map();

export function registerRunLedger(turnKey, ledger) {
  turnLedgers.set(turnKey, ledger);
  return () => turnLedgers.delete(turnKey);
}

export function observeAtlasProviderCall(options, callId, call) {
  const ledger = turnLedgers.get(options?.turnId);
  return ledger ? ledger.ask(() => call(true), options.task, callId) : call(false);
}

export function makeRunLedger(opt) {
  const now = (opt && typeof opt.now === 'function') ? opt.now : () => Date.now();
  const startedAt = opt?.startedAt ?? now();
  const models = Object.create(null);   /* model id → { calls, costUsd, ms } */
  const providerCallIds = new Set();
  const tools = Object.create(null);    /* capability / tool name → { calls, ms, failed } */
  let modelCalls = 0, modelPending = 0, costUsd = 0, costUnknownCalls = 0, unpricedCalls = 0, modelMs = 0, webCalls = 0;
  let delegatedUsd = 0, delegatedTasks = 0;
  const marks = Object.create(null);   /* name → ms since the turn started, the first time it happened */
  return {
    /* Wrap the request itself so an error, a repair and a review each leave one observation.
       Still-pending requests at cancellation have unknown cost until the server journal arrives. */
    async ask(call, task, callId) {
      const began = now();
      let meta;
      if (callId) providerCallIds.add(callId);
      modelPending++;
      try {
        const reply = await call();
        meta = reply?.meta;
        return reply;
      } catch (e) {
        meta = e?.meta;
        throw e;
      } finally {
        modelPending--;
        this.model({ model: meta?.modelServed || meta?.model || task, costUsd: meta?.costUsd,
          costComplete: meta?.costComplete, priceKnown: meta?.priceKnown, ms: now() - began, web: meta?.webUsed });
      }
    },
    /* one provider request or loop observation; costUsd is a floor if usage was only partially reported */
    model(c) {
      c = c || {};
      modelCalls++;
      const id = str(c.model, 80) || 'unknown';
      const m = models[id] || (models[id] = { calls: 0, costUsd: 0, ms: 0 });
      m.calls++; m.ms += num(c.ms); modelMs += num(c.ms);
      if (typeof c.costUsd !== 'number' || !Number.isFinite(c.costUsd) || c.costComplete === false) costUnknownCalls++;
      if (Number.isFinite(c.costUsd)) { m.costUsd += num(c.costUsd); costUsd += num(c.costUsd); }
      if (c.priceKnown === false) unpricedCalls++;
      if (c.web) webCalls++;
    },
    /* one tool run: { name, ms, ok, delegatedCostUsd?, delegatedTasks? } — a delegation's workers are paid apart from the turn's own calls */
    tool(c) {
      c = c || {};
      const id = str(c.name, 80) || 'unknown';
      const t = tools[id] || (tools[id] = { calls: 0, ms: 0, failed: 0 });
      t.calls++; t.ms += num(c.ms);
      if (c.ok === false) t.failed++;
      const d = num(c.delegatedCostUsd);
      if (d) { delegatedUsd += d; }
      if (Number.isFinite(Number(c.delegatedTasks))) delegatedTasks += Math.max(0, Math.floor(Number(c.delegatedTasks)));
    },
    /* a worker that ended after the answer which left it running: its cost joins the delegated sum (its task was counted when it was listed) */
    late(c) { const d = num(c); if (d) delegatedUsd += d; },
    /* one instant of the turn (see runMarkSink); a second report of the same name keeps the first */
    mark(name) { const k = str(name, 40); if (k && !(k in marks)) marks[k] = Math.max(0, now() - startedAt); return marks[k]; },
    marked(name) { return Object.prototype.hasOwnProperty.call(marks, String(name)); },
    summary() {
      const rows = (o, f) => Object.keys(o).map((k) => Object.assign({ id: k }, o[k])).sort(f);
      return {
        wallMs: Math.max(0, now() - startedAt),
        modelCalls: modelCalls + modelPending, modelMs, providerCallIds: Array.from(providerCallIds),
        /* the turn's own provider answers + what its delegated workers cost: two sums the reader can tell apart */
        costUsd: costUsd + delegatedUsd, parentCostUsd: costUsd, delegatedCostUsd: delegatedUsd, delegatedTasks,
        costUnknownCalls: costUnknownCalls + modelPending, unpricedCalls, webCalls,
        models: rows(models, (a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
        tools: rows(tools, (a, b) => b.ms - a.ms || b.calls - a.calls),
        marks: Object.assign({}, marks),
      };
    },
  };
}

/* The words the line is made of. English here; the page passes its own (js/atlas-console.js, which owns the language
   machinery) — this file holds no translation so no tuple of two languages lives in it. */
const RUN_WORDS = Object.freeze({ sec: ' s', notReported: 'cost not reported', unreported: ' + unreported', workers: 'workers ', unpriced: 'some calls priced at the highest rate' });

/* one quiet sentence; null when there is nothing worth saying (no provider answer was measured) */
export function runLine(s, words) {
  if (!s || !s.modelCalls) return null;
  const W = Object.assign({}, RUN_WORDS, words || {});
  const usd = (n) => '$' + (n < 0.01 ? n.toFixed(4) : n.toFixed(3));
  const sec = (ms) => (ms < 10000 ? (ms / 1000).toFixed(1) : String(Math.round(ms / 1000))) + W.sec;
  const parts = [];
  parts.push(s.costUnknownCalls === s.modelCalls ? W.notReported : usd(s.costUsd) + (s.costUnknownCalls ? W.unreported : ''));
  parts.push(sec(s.wallMs));
  parts.push(s.models.map((m) => m.id + (m.calls > 1 ? ' ×' + m.calls : '')).join(', '));
  if (s.delegatedCostUsd > 0) parts.push(W.workers + usd(s.delegatedCostUsd));
  const used = s.tools.filter((t) => t.id !== 'unknown').slice(0, 3);
  if (used.length) parts.push(used.map((t) => t.id + (t.calls > 1 ? ' ×' + t.calls : '')).join(', '));
  if (s.unpricedCalls) parts.push(W.unpriced);
  return parts.join(' · ');
}

/* the last `max` summaries (newest last) — what a later view lists and compares */
export function makeRunHistory(max) {
  const cap = Number.isInteger(max) && max > 0 ? max : 50;
  const list = [];
  return {
    add(s, label) { if (s && s.modelCalls) { list.push(Object.assign({ at: Date.now(), label: str(label, 120) }, s)); while (list.length > cap) list.shift(); } },
    all() { return list.slice(); },
    totals() { return list.reduce((m, r) => ({ runs: m.runs + 1, costUsd: m.costUsd + r.costUsd, wallMs: m.wallMs + r.wallMs }), { runs: 0, costUsd: 0, wallMs: 0 }); },
  };
}
