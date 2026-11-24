#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ATLAS — HOW OFTEN DID THE REQUESTED THING ACTUALLY EXIST?  (a series, not a one-off)
 * ----------------------------------------------------------------------------
 *  #1377 measured this once by hand; #1333 judges completion inside a turn. This keeps the measurement as a
 *  series: every evaluation report (scripts/atlas-eval.mjs → report.json) carries `completionRate`
 *  (scripts/atlas-eval/deliverables.mjs) — the share of requested deliverables (a layer on, shapes drawn, a
 *  table with rows) that existed when the turn ended, and the turns that SAID complete while one was absent.
 *  This folds one report into one row and appends it to a history file the nightly carries forward.
 *
 *      node scripts/atlas-completion-rate.mjs --report <report.json> [--history <file.jsonl>] [--print]
 *      node scripts/atlas-completion-rate.mjs --history <file.jsonl>          # the trend, no new row
 *
 *  A row: { when, build, url, turns, observedTurns, unobservedTurns, finishedTurns, turnRate,
 *           deliverables, deliverablesPresent, deliverableRate, falseCompletion:[ids], honestIncomplete:[ids] }
 *  RECORD STYLE: one JSON object per line, append-only, oldest first. A row from a dry-run, or one that
 *  observed no turn, is NOT appended (it would be a zero that is not a measurement). Rates are over observed
 *  turns; `unobservedTurns` is counted apart and never as a failure.
 *  Nothing here gates a pull request; a falling `deliverableRate` is read in the report, by a person.
 * ==========================================================================*/
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/** one report → one history row, or null when the report measured nothing (dry run / no observed turn) */
export function rowOf(report) {
  const c = report && report.completionRate;
  if (!c || report.dryRun || !c.observedTurns) return null;
  return {
    when: report.when || null, build: report.build || null, url: report.url || null,
    turns: c.turns, observedTurns: c.observedTurns, unobservedTurns: c.unobservedTurns, finishedTurns: c.finishedTurns,
    turnRate: c.turnRate, deliverables: c.deliverables, deliverablesPresent: c.deliverablesPresent, deliverableRate: c.deliverableRate,
    falseCompletion: c.falseCompletion || [], honestIncomplete: c.honestIncomplete || [],
  };
}

export function readHistory(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
}

const pct = (v) => (v == null ? 'n/a' : (v * 100).toFixed(1) + '%');
export function renderTrend(rows) {
  if (!rows.length) return 'no rows yet';
  const out = ['when                 build     turns(obs/unobs)  finished   deliverables      said-complete-but-absent'];
  for (const r of rows) {
    out.push([String(r.when || '').slice(0, 19).padEnd(20), String(r.build || '').slice(0, 8).padEnd(9),
      (r.observedTurns + '/' + r.unobservedTurns).padEnd(17), pct(r.turnRate).padEnd(10),
      (r.deliverablesPresent + '/' + r.deliverables + ' ' + pct(r.deliverableRate)).padEnd(17), (r.falseCompletion || []).length].join(' '));
  }
  const a = rows[rows.length - 1], b = rows.length > 1 ? rows[rows.length - 2] : null;
  if (b && a.deliverableRate != null && b.deliverableRate != null) out.push('latest vs previous deliverable rate: ' + ((a.deliverableRate - b.deliverableRate) * 100).toFixed(1) + ' points');
  return out.join('\n');
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const reportPath = arg('--report'), histPath = arg('--history');
  const rows = histPath && existsSync(histPath) ? readHistory(readFileSync(histPath, 'utf8')) : [];
  if (reportPath) {
    const row = rowOf(JSON.parse(readFileSync(reportPath, 'utf8')));
    if (!row) console.log('report measured no deliverable (dry run, or no observed turn): no row appended');
    else {
      if (histPath) { mkdirSync(dirname(histPath), { recursive: true }); appendFileSync(histPath, JSON.stringify(row) + '\n'); }
      rows.push(row);
      console.log('row: ' + JSON.stringify(row));
    }
  }
  if (histPath || process.argv.includes('--print')) console.log(renderTrend(rows));
  if (!reportPath && !histPath) { console.error('usage: --report <report.json> [--history <file.jsonl>] | --history <file.jsonl>'); process.exit(2); }
}
