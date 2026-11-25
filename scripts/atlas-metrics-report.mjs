#!/usr/bin/env node
/* ============================================================================
 *  atlas-metrics-report — put two windows of Atlas metrics side by side
 * ----------------------------------------------------------------------------
 *  Usage:  node scripts/atlas-metrics-report.mjs <before.json> <after.json>
 *  Each file is the jsonb the administrator's RPC returns for one window (run in the signed-in admin console on the production site):
 *      copy((await sb.rpc('atlas_metrics_overview', { p_from: '2026-11-18T00:00:00Z', p_to: '2026-11-25T00:00:00Z' })).data)   // → JSON
 *  The RPC is admin-only (public.is_admin(): the flag AND an MFA session), so it cannot be run from a script with a service key.
 *
 *  It prints each figure for both windows and the change, and says which direction is better. IT DOES NOT SAY WHETHER THE ANSWERS GOT
 *  BETTER — that is a person's judgement (production auto-evaluation is frozen) — and it is not a gate: nothing here exits non-zero for a
 *  slower or dearer window. A figure that was not measured in a window (null) is printed as «–», never as 0.
 *  docs/MONITORING.md «2b4. Atlas answer metrics» is the reference for what each figure is.
 * ==========================================================================*/
import fs from 'node:fs';

/* [path in the RPC's jsonb, label, unit, better] — better: 'down' | 'up' | null (no direction: a description, not a goal) */
export const FIGURES = [
  ['turns.turns', 'answers', 'n', null],
  ['turns.total_ms_p50', 'time to the whole answer, median', 'ms', 'down'],
  ['turns.total_ms_p90', 'time to the whole answer, p90', 'ms', 'down'],
  ['turns.first_useful_ms_p50', 'time to the first useful result, median', 'ms', 'down'],
  ['turns.first_useful_ms_p90', 'time to the first useful result, p90', 'ms', 'down'],
  ['turns.completion_rate', 'answers that declared themselves complete', 'ratio', 'up'],
  ['turns.cost_per_success_micros', 'cost per complete answer', 'micros', 'down'],
  ['turns.cost_per_turn_micros', 'cost per answer', 'micros', 'down'],
  ['turns.capability_found_rate', 'operations that asked for a tool that exists', 'ratio', 'up'],
  ['turns.duplicate_op_rate', 'operations that repeated an identical earlier one', 'ratio', 'down'],
  ['turns.grounded_claim_rate', 'findings that carry a source', 'ratio', 'up'],
  ['turns.program_verified_share', 'checks decided by a program (not a model)', 'ratio', null],
  ['turns.model_wait_share', 'share of the wait spent on the model', 'ratio', null],
  ['turns.model_calls_per_turn', 'model calls per answer', 'n', 'down'],
  ['calls.cache_rate', 'input tokens served from the provider cache', 'ratio', 'up'],
  ['calls.root_cache_rate', 'same, the parent turn only', 'ratio', 'up'],
  ['calls.latency_ms_p50', 'model call latency, median', 'ms', 'down'],
  ['calls.latency_ms_p90', 'model call latency, p90', 'ms', 'down'],
  ['families.delegating_turns', 'turns that delegated', 'n', null],
  ['families.slowest_child_share_p50', 'slowest child as a share of the parent wait, median', 'ratio', 'down'],
  ['families.children_dominate_rate', 'delegating turns where a child was over half the wait', 'ratio', 'down'],
];

const get = (o, p) => p.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);
const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
export function fmt(v, unit) {
  if (v === null) return '–';
  if (unit === 'ratio') return (v * 100).toFixed(1) + '%';
  if (unit === 'ms') return v < 1000 ? Math.round(v) + ' ms' : (v / 1000).toFixed(v < 10000 ? 2 : 1) + ' s';
  if (unit === 'micros') return '$' + (v / 1e6).toFixed(4);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/* compare(before, after) → [{ label, before, after, change, verdict }]; verdict is 'better' | 'worse' | 'same' | 'no direction' | 'not measured' */
export function compare(before, after) {
  return FIGURES.map(([p, label, unit, better]) => {
    const a = num(get(before, p)), b = num(get(after, p));
    let verdict = 'no direction', change = null;
    if (a === null || b === null) verdict = 'not measured';
    else {
      change = a === 0 ? (b === 0 ? 0 : null) : (b - a) / Math.abs(a);
      if (b === a) verdict = 'same';
      else if (better) verdict = (better === 'down') === (b < a) ? 'better' : 'worse';
    }
    return { path: p, label, unit, before: a, after: b, change, verdict };
  });
}

export function render(rows, before, after) {
  const pad = (s, n) => String(s).padEnd(n);
  const out = ['Atlas metrics — ' + (before && before.from ? before.from + ' → ' + before.to : 'before') + '   vs   ' + (after && after.from ? after.from + ' → ' + after.to : 'after'), ''];
  rows.forEach((r) => out.push(pad(r.label, 58) + pad(fmt(r.before, r.unit), 12) + pad(fmt(r.after, r.unit), 12) + pad(r.change === null ? '' : (r.change >= 0 ? '+' : '') + (r.change * 100).toFixed(1) + '%', 10) + r.verdict));
  const kids = (j) => (get(j, 'children') || []).map((c) => c.model + ' ×' + c.calls + ' (cost ' + fmt(num(c.cost_share), 'ratio') + ', wait ' + fmt(num(c.wait_share), 'ratio') + ')').join('; ') || '–';
  out.push('', 'children before: ' + kids(before), 'children after:  ' + kids(after));
  const tools = (j) => (get(j, 'turns.critical_tools') || []).map((c) => c.tool + ' ' + fmt(num(c.ms), 'ms')).join('; ') || '–';
  out.push('slowest tools before: ' + tools(before), 'slowest tools after:  ' + tools(after));
  return out.join('\n');
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [bf, af] = process.argv.slice(2);
  if (!bf || !af) { console.error('usage: node scripts/atlas-metrics-report.mjs <before.json> <after.json>'); process.exit(2); }
  const before = JSON.parse(fs.readFileSync(bf, 'utf8')), after = JSON.parse(fs.readFileSync(af, 'utf8'));
  console.log(render(compare(before, after), before, after));
}
