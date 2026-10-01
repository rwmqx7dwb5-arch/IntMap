/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — the replay run, and the report read over time
 * ----------------------------------------------------------------------------
 *  Two things live here, both pure over data handed in (no browser, no network):
 *
 *    evaluateCassettes — every cassette in scripts/atlas-eval/cassettes/ replayed (replay.mjs) and judged
 *      (judge.mjs + grade.mjs), and held to what the cassette says the judge must conclude. Run on every
 *      PR by tests/atlas-quality-lab-checks.test.mjs and by `node scripts/atlas-eval.mjs --replay`.
 *
 *    summaryOf / renderTrend — one night's report folded into one row, and the rows read as a time
 *      series: by kind of question, by language, by capability. The nightly carries its history forward
 *      in its own report (the previous report is already downloaded for the regression reference), so
 *      the trend needs no store of its own.
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { judgeTurn, metricsOf } from './judge.mjs';
import { replayCassette, validateCassette } from './replay.mjs';

export function loadSets(root) {
  return {
    records: JSON.parse(readFileSync(join(root, 'scripts/atlas-eval/questions.json'), 'utf8')),
    answers: JSON.parse(readFileSync(join(root, 'scripts/atlas-eval/answer-key.json'), 'utf8')),
  };
}

export function loadCassettes(root) {
  const dir = join(root, 'scripts/atlas-eval/cassettes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => Object.assign(JSON.parse(readFileSync(join(dir, f), 'utf8')), { __file: 'scripts/atlas-eval/cassettes/' + f }));
}

/** the question a cassette is graded as — by reference, so a cassette cannot carry a private copy of
 *  an expectation that has since changed in the problem set */
export function questionOf(sets, cas) {
  const ref = cas.question;
  if (!ref) return { id: cas.id, lang: cas.lang, text: cas.text, sendable: true, expect: {}, unset: {} };
  const set = ref.set === 'answers' ? sets.answers : sets.records;
  const q = ((set && set.questions) || []).find((x) => x.id === ref.id);
  return q ? Object.assign({ sendable: true, expect: {} }, q) : null;
}

/** rulesOf(P) — the rules the judge is handed, from the product (the same three the harness hands in) */
export function rulesOf(P) {
  const A = P.makeAtlasAgent();
  return { cutStops: A.CUT_STOPS, turnBudgetMs: A.LIMITS.turnBudgetMs, callKey: P.makeAtlasTurnResults({}).callKey };
}

/**
 * evaluateCassettes(cassettes, {P, sets}) → [{ id, file, origin, judged, divergences, problems }]
 * `problems` is everything that makes the replay red: a malformed cassette, a question it names that
 * does not exist or reads differently, a divergence, and a judgement other than the one declared.
 */
export async function evaluateCassettes(cassettes, { P, sets }) {
  const rules = rulesOf(P);
  const out = [];
  for (const cas of cassettes) {
    const problems = validateCassette(cas);
    const q = questionOf(sets, cas);
    if (!q) problems.push('names question ' + JSON.stringify(cas.question) + ', which the problem set does not have');
    else if (q.text !== cas.text) problems.push('was recorded for «' + cas.text + '» but the problem set now asks «' + q.text + '» — re-record it');
    if (problems.length) { out.push({ id: cas.id, file: cas.__file, origin: cas.origin, judged: null, divergences: [], problems }); continue; }
    const r = await replayCassette(cas, P);
    const judged = judgeTurn(q, r.obs, rules);
    for (const d of r.divergences) problems.push('divergence (' + d.kind + '): ' + d.detail);
    const e = cas.expect || {};
    const kinds = [...new Set(judged.failures.map((f) => f.kind))].sort();
    if (e.verdict === 'pass' && kinds.length) problems.push('the judge now fails a turn recorded as good: ' + judged.failures.map((f) => f.kind + ' — ' + f.detail).join(' | '));
    if (e.verdict === 'fail') {
      const want = [...new Set(e.failures || [])].sort();
      const missing = want.filter((k) => kinds.indexOf(k) < 0), extra = kinds.filter((k) => want.indexOf(k) < 0);
      if (missing.length) problems.push('the judge no longer finds the recorded defect: ' + missing.join(', ') + ' (found: ' + (kinds.join(', ') || 'nothing') + ')');
      if (extra.length) problems.push('the judge finds failures the cassette does not declare: ' + extra.join(', ') + ' — ' + judged.failures.filter((f) => extra.indexOf(f.kind) >= 0).map((f) => f.detail).join(' | '));
    }
    if (e.grade && (!judged.metrics.grade || judged.metrics.grade.verdict !== e.grade)) problems.push('the answer grades ' + (judged.metrics.grade ? judged.metrics.grade.verdict : '(not graded)') + '; recorded ' + e.grade);
    if (e.dispatched != null && r.dispatched !== e.dispatched) problems.push(r.dispatched + ' action(s) reached the dispatch; recorded ' + e.dispatched);
    out.push({ id: cas.id, file: cas.__file, origin: cas.origin, judged, divergences: r.divergences, problems });
  }
  return out;
}

/** renderReplay(results) — the PR-time report */
export function renderReplay(results) {
  const L = [];
  const bad = results.filter((r) => r.problems.length);
  const judged = results.filter((r) => r.judged).map((r) => r.judged);
  const M = metricsOf(judged, []);
  L.push('# Atlas replay — ' + (bad.length ? bad.length + ' of ' + results.length + ' cassette(s) red' : results.length + ' cassette(s) green'));
  L.push('');
  L.push('No model was called. Each cassette is one turn (the model\'s replies and what the browser returned), replayed through the current `js/atlas-agent.js`, `js/atlas-toolsurface.js`, registry and schemas, and judged by `scripts/atlas-eval/judge.mjs` + `grade.mjs`.');
  L.push('');
  L.push('| cassette | origin | stop | grade | judged | result |');
  L.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const j = r.judged;
    L.push('| `' + r.id + '` | ' + (r.origin ? r.origin.kind : '?') + ' | ' + (j ? '`' + (j.metrics.stopped || '?') + '`' : '—') + ' | ' + (j && j.metrics.grade ? j.metrics.grade.verdict : '—') + ' | '
      + (j ? (j.failures.length ? [...new Set(j.failures.map((f) => f.kind))].join(', ') : 'clean') : '—') + ' | ' + (r.problems.length ? '**red**' : 'green') + ' |');
  }
  if (bad.length) {
    L.push('');
    L.push('## Red');
    for (const r of bad) { L.push(''); L.push('### `' + r.id + '` (' + r.file + ')'); for (const p of r.problems) L.push('* ' + p); }
  }
  L.push('');
  L.push('Graded answers in the replayed set: ' + M.answers.correct + ' correct / ' + M.answers.incorrect + ' incorrect / ' + M.answers.absent + ' absent of ' + M.answers.graded + ' (these are the cassettes\' own answers — the measure of Atlas is the nightly).');
  return L.join('\n');
}

/* ── the time series ──────────────────────────────────────────────────────────────────────────────
   HISTORY_KEEP: one row is ≈ 2 KB of JSON (≈ 9 categories, 2 languages, ≈ 25 capabilities, each two
   numbers); 180 rows — half a year of nights — is ≈ 360 KB inside a report that already carries every
   turn's record. Past that, the artifact (30-day retention) is not where a longer history belongs. */
export const HISTORY_KEEP = 180;

const pair = (t) => [t.correct, t.n];
/** summaryOf(report) — one night, one row */
export function summaryOf(r) {
  const M = r.metrics || {};
  const A = M.answers || { byCategory: {}, byLang: {}, byCapability: {} };
  const map = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, pair(v)]));
  return {
    when: r.when, build: r.build || null, verdict: r.verdict, runUrl: r.runUrl || null,
    measured: M.measured || 0, questions: M.questions || 0,
    reach: M.reach ? [M.reach.reached, M.reach.of] : null,
    answers: [A.correct || 0, A.graded || 0], absent: A.absent || 0,
    rubric: A.rubric ? [A.rubric.pass, A.rubric.graded] : null,
    cut: M.cutTurns ? M.cutTurns.n : 0, sameCallAgain: M.secondOfSameOp ? M.secondOfSameOp.total : 0,
    p50: M.durationMs ? M.durationMs.p50 : null,
    byCategory: map(A.byCategory), byLang: map(A.byLang), byCapability: map(A.byCapability),
  };
}

/** historyOf(previous, report) — the previous report's history with tonight appended (a dry or partial
 *  run appends nothing: it measured nothing comparable) */
export function historyOf(previous, report) {
  const h = (previous && Array.isArray(previous.history)) ? previous.history.slice() : [];
  if (!report.dryRun && !report.partial && report.metrics && report.metrics.measured) h.push(summaryOf(report));
  return h.slice(-HISTORY_KEEP);
}

const pct = (p) => (!p || !p[1] ? '—' : Math.round((100 * p[0]) / p[1]) + '% (' + p[0] + '/' + p[1] + ')');

/** renderTrend(history, nights) — the last `nights` rows as tables a reader can scan down a column */
export function renderTrend(history, nights = 14) {
  const rows = (history || []).slice(-nights);
  const L = ['## Over time', ''];
  if (!rows.length) { L.push('No measured night yet — the trend starts with the first night that measures something.'); return L.join('\n'); }
  const day = (r) => String(r.when || '').slice(0, 10);
  L.push('| night | verdict | measured | reach | answers right | rubric pass | cut short | same call again | p50 |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) L.push('| ' + day(r) + ' | ' + r.verdict + ' | ' + r.measured + '/' + r.questions + ' | ' + pct(r.reach) + ' | ' + pct(r.answers) + ' | ' + pct(r.rubric) + ' | ' + r.cut + ' | ' + r.sameCallAgain + ' | ' + (r.p50 == null ? '—' : (r.p50 / 1000).toFixed(0) + ' s') + ' |');
  for (const [title, field] of [['By kind of question', 'byCategory'], ['By language', 'byLang'], ['By capability', 'byCapability']]) {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r[field] || {})))].sort();
    if (!keys.length) continue;
    L.push('');
    L.push('### ' + title + ' — answers right, night by night (oldest → newest)');
    L.push('');
    L.push('| ' + field.replace(/^by/, '').toLowerCase() + ' | ' + rows.map(day).join(' | ') + ' |');
    L.push('|---|' + rows.map(() => '---|').join(''));
    /* worst first: the row a reader should look at is the one at the top */
    const latest = (k) => { const p = rows[rows.length - 1][field] && rows[rows.length - 1][field][k]; return p && p[1] ? p[0] / p[1] : 2; };
    for (const k of keys.sort((a, b) => latest(a) - latest(b))) L.push('| ' + k + ' | ' + rows.map((r) => { const p = r[field] && r[field][k]; return p && p[1] ? p[0] + '/' + p[1] : '—'; }).join(' | ') + ' |');
  }
  return L.join('\n');
}
