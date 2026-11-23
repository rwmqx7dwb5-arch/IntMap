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

export function makeRunLedger(opt) {
  const now = (opt && typeof opt.now === 'function') ? opt.now : () => Date.now();
  const startedAt = now();
  const models = Object.create(null);   /* model id → { calls, costUsd, ms } */
  const tools = Object.create(null);    /* capability / tool name → { calls, ms, failed } */
  let modelCalls = 0, costUsd = 0, costUnknownCalls = 0, unpricedCalls = 0, modelMs = 0, webCalls = 0;
  let delegatedUsd = 0, delegatedTasks = 0;
  return {
    /* one provider answer: { model, costUsd, priceKnown, ms, web } — costUsd undefined when the proxy did not say */
    model(c) {
      c = c || {};
      modelCalls++;
      const id = str(c.model, 80) || 'unknown';
      const m = models[id] || (models[id] = { calls: 0, costUsd: 0, ms: 0 });
      m.calls++; m.ms += num(c.ms); modelMs += num(c.ms);
      if (c.costUsd === undefined || c.costUsd === null || !Number.isFinite(Number(c.costUsd))) costUnknownCalls++;
      else { m.costUsd += num(c.costUsd); costUsd += num(c.costUsd); }
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
    summary() {
      const rows = (o, f) => Object.keys(o).map((k) => Object.assign({ id: k }, o[k])).sort(f);
      return {
        wallMs: Math.max(0, now() - startedAt),
        modelCalls, modelMs,
        /* the turn's own provider answers + what its delegated workers cost: two sums the reader can tell apart */
        costUsd: costUsd + delegatedUsd, parentCostUsd: costUsd, delegatedCostUsd: delegatedUsd, delegatedTasks,
        costUnknownCalls, unpricedCalls, webCalls,
        models: rows(models, (a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
        tools: rows(tools, (a, b) => b.ms - a.ms || b.calls - a.calls),
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
