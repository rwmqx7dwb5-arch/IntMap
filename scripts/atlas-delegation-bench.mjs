#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ATLAS DELEGATION BENCH — does handing pieces to workers pay, measured on the same question twice
 * ----------------------------------------------------------------------------
 *  research.delegate (js/atlas-cap-research.js) lets Atlas hand independent pieces of a request to worker models
 *  that run at the same time. Until this existed nobody could say whether it makes an answer faster, dearer or
 *  better, because every turn is one run of one question and Atlas decides by itself whether to delegate.
 *
 *      node scripts/atlas-delegation-bench.mjs --offline [--questions id,id] [--out dir]
 *      node scripts/atlas-delegation-bench.mjs [--questions id,id] [--url <site>] [--out dir]
 *                                              [--rotated-token-out <file>] [--headed] [--deadline-min <n>]
 *
 *  A/B. Each question is asked twice through the same machinery as the nightly (scripts/atlas-eval.mjs
 *  openAtlasSession / askOnFreshPage / observeTurn, and scripts/atlas-eval/judge.mjs judgeTurn):
 *      arm A  the question, with a sentence in front asking Atlas to split it into parallel pieces via research.delegate
 *      arm B  the question, with a sentence in front asking Atlas not to use research.delegate
 *  and the two are compared on wall-clock, calls, worker cost, the judged correctness, and what the children did.
 *
 *  ⚠ THE PREFIX IS THE EXPERIMENT, NOT THE PRODUCT. In production Atlas decides whether to delegate — nothing in
 *    IntMap tells it to, and nothing here changes that (CONSTITUTION.md §5: Atlas holds the decision). The two
 *    sentences exist only so that the same question can be observed both ways. A turn that did not do what its
 *    arm asked (arm A that never delegated, arm B that did) is reported as exactly that — `followed:false` — and is
 *    still a measurement of what Atlas did.
 *
 *  --offline   replays the paired scripted cassettes (scripts/atlas-eval/scripted-cassettes.mjs, `arm` delegate /
 *              direct on the same question) through the real loop and surface: no login, no model, no network — it
 *              is what CI can run. Its children's cost and time are the cassettes' FIXTURES, and the wall-clock of
 *              a whole turn is not recorded at all (shown as —): offline measures that the judge reads delegation
 *              correctly, not how fast delegation is. Online is the measurement.
 *  online      uses ATLAS_EVAL_REFRESH_TOKEN exactly as the nightly does (docs/TESTING.md), and with the same
 *              rotation: the refresh token is spent by use, so --rotated-token-out keeps the next one.
 *
 *  COST. `workerCostUsd` is meta.delegatedCostUsd — the workers' spend, which the page reports. The parent turn's own
 *  model cost is in the server's ledger and is not on the page, so it is not in this number: the comparison is
 *  "what delegating added", not an invoice.
 *
 *  EXIT  0 the bench ran (a slow or dear delegation is a RESULT, never an exit code) · 1 a harness error: a paired
 *        cassette that no longer replays as recorded, a question with one arm only, the page did not boot, or no
 *        arm could be measured at all · 2 usage (an online run with no token)
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judgeTurn } from './atlas-eval/judge.mjs';
import { replayCassette, validateCassette, productModules } from './atlas-eval/replay.mjs';
import { loadCassettes, loadSets, questionOf, rulesOf } from './atlas-eval/lab.mjs';
import {
  askable, observeTurn, openAtlasSession, askOnFreshPage, productRules, PAGE, PROD_URL,
} from './atlas-eval.mjs';
import { sectionsRead } from './atlas-eval/map-state.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DELEGATE_CAPABILITY = 'research.delegate';

/* The two sentences of the experiment, in the two languages IntMap writes in (CONSTITUTION.md §7). They are
   not product text: no reader of IntMap ever sees them, and no code path outside this file sends them. */
export const ARM_PREFIX = Object.freeze({
  delegate: Object.freeze({
    en: 'For this request, split it into its independent pieces and research the pieces in parallel with research.delegate (one task per piece), then integrate what they return.',
    jp: 'この依頼は、独立した部分に分けて research.delegate で並行して調べ、返ってきた結果を統合してください。',
  }),
  direct: Object.freeze({
    en: 'For this request, do not use research.delegate; research what you need directly.',
    jp: 'この依頼では research.delegate を使わず、必要なことは直接調べてください。',
  }),
});
export const ARMS = Object.freeze(['delegate', 'direct']);

/** prefixed(arm, q) → the text asked in that arm */
export function prefixed(arm, q) {
  const p = ARM_PREFIX[arm] && ARM_PREFIX[arm][q.lang];
  if (!p) throw new Error('no prefix for arm ' + arm + ' in language ' + q.lang);
  return p + '\n\n' + q.text;
}

const sum = (xs) => xs.reduce((s, v) => s + v, 0);
const num = (v) => (v != null && Number.isFinite(+v) ? +v : null);

/**
 * armRow(arm, judged, extra) — one question in one arm, in the numbers the bench compares.
 * Not measured stays null and says why; a number the record does not carry is null, never 0.
 *   extra { modelCalls }   the turn's model calls (the page's aiCalls; a replay's steps)
 */
export function armRow(arm, judged, extra) {
  if (!judged || !judged.measured) return { arm, id: judged && judged.id, measured: false, unmeasured: (judged && judged.unmeasured) || 'no_observation', detail: (judged && judged.detail) || '' };
  const m = judged.metrics, d = m.delegation;
  const delegated = !!(d && d.observed && d.calls > 0);
  return {
    arm, id: judged.id, measured: true,
    wallMs: num(m.ms),
    toolCalls: m.operations,
    modelCalls: num(extra && extra.modelCalls),
    /* the workers' spend: none when the turn did not delegate (observed), unknown when delegation was not observed */
    workerCostUsd: d ? (d.observed ? d.costUsd : null) : (m.findCapability === null ? null : 0),   /* findCapability is null exactly when the tool-call tap saw nothing */
    answer: m.grade ? m.grade.verdict : null,
    failures: [...new Set(judged.failures.map((f) => f.kind))],
    delegated,
    /* did the turn do what its arm asked? Atlas decides; this only says whether it did */
    followed: arm === 'delegate' ? delegated : (d ? !delegated : true),
    children: d && d.observed ? { count: d.delegatedCount, states: d.states, refused: d.refused, unobservable: d.unobservable, regrouped: d.regrouped,
      maxChildMs: d.maxChildMs, callMs: d.callMs, overlapped: d.overlapped, slowestShareOfCall: d.slowestShareOfCall } : null,
  };
}

/** summarise(rows) → per-arm aggregate and the per-question pairing */
export function summarise(rows) {
  const byArm = {};
  for (const arm of ARMS) {
    const mine = rows.filter((r) => r.arm === arm);
    const m = mine.filter((r) => r.measured);
    const ms = m.map((r) => r.wallMs).filter((v) => v != null);
    const cost = m.map((r) => r.workerCostUsd).filter((v) => v != null);
    const states = {};
    for (const r of m) if (r.children) for (const [k, n] of Object.entries(r.children.states)) states[k] = (states[k] || 0) + n;
    byArm[arm] = {
      questions: mine.length, measured: m.length,
      wallMs: { n: ms.length, total: ms.length ? sum(ms) : null, mean: ms.length ? sum(ms) / ms.length : null },
      toolCalls: sum(m.map((r) => r.toolCalls)),
      modelCalls: m.some((r) => r.modelCalls != null) ? sum(m.map((r) => r.modelCalls || 0)) : null,
      workerCostUsd: cost.length ? sum(cost) : null,
      correct: m.filter((r) => r.answer === 'correct').length, graded: m.filter((r) => r.answer != null).length,
      delegatedTurns: m.filter((r) => r.delegated).length, followed: m.filter((r) => r.followed).length,
      childStates: states,
    };
  }
  const ids = [...new Set(rows.map((r) => r.id))];
  const pairs = ids.map((id) => {
    const a = rows.find((r) => r.id === id && r.arm === 'delegate'), b = rows.find((r) => r.id === id && r.arm === 'direct');
    const both = !!(a && b && a.measured && b.measured);
    const diff = (k) => (both && a[k] != null && b[k] != null ? a[k] - b[k] : null);
    return { id, delegate: a || null, direct: b || null, paired: both, delta: { wallMs: diff('wallMs'), toolCalls: diff('toolCalls'), modelCalls: diff('modelCalls'), workerCostUsd: diff('workerCostUsd') } };
  });
  return { byArm, pairs };
}

const secs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + ' s');
const usd = (v) => (v == null ? '—' : '$' + v.toFixed(4));
const kids = (r) => (r.children ? r.children.count + ' (' + Object.entries(r.children.states).map(([k, n]) => k + ' ' + n).join(', ') + ')' + (r.children.regrouped ? ' regrouped' : '') : (r.delegated ? 'not observed' : '—'));

/** renderTable(report) — the short table the run prints */
export function renderTable(rep) {
  const L = [];
  L.push('Atlas delegation bench — ' + rep.mode + (rep.mode === 'offline' ? ' (paired scripted cassettes; time and cost are fixtures, whole-turn wall-clock is not recorded)' : ' — ' + rep.url + (rep.build ? ' (build ' + rep.build + ')' : '')));
  L.push('The prefix is the experiment: in production Atlas decides whether to delegate.');
  L.push('');
  L.push('| question | arm | wall | tool calls | model calls | worker cost | answer | children |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of rep.rows) {
    if (!r.measured) { L.push('| ' + r.id + ' | ' + r.arm + ' | not measured: ' + r.unmeasured + (r.detail ? ' — ' + r.detail : '') + ' | | | | | |'); continue; }
    L.push('| ' + r.id + ' | ' + r.arm + (r.followed ? '' : ' (not followed)') + ' | ' + secs(r.wallMs) + ' | ' + r.toolCalls + ' | ' + (r.modelCalls == null ? '—' : r.modelCalls) + ' | ' + usd(r.workerCostUsd)
      + ' | ' + (r.answer || '—') + (r.failures.length ? ' [' + r.failures.join(', ') + ']' : '') + ' | ' + kids(r) + ' |');
  }
  L.push('');
  for (const arm of ARMS) {
    const a = rep.summary.byArm[arm];
    L.push('* ' + arm + ': ' + a.measured + '/' + a.questions + ' measured · wall ' + (a.wallMs.n ? secs(a.wallMs.mean) + ' mean over ' + a.wallMs.n : '—') + ' · tool calls ' + a.toolCalls
      + ' · model calls ' + (a.modelCalls == null ? '—' : a.modelCalls) + ' · worker cost ' + usd(a.workerCostUsd) + ' · right ' + a.correct + '/' + a.graded
      + ' · delegated in ' + a.delegatedTurns + ' turn(s)' + (Object.keys(a.childStates).length ? ' · children ' + Object.entries(a.childStates).map(([k, n]) => k + ' ' + n).join(', ') : ''));
  }
  const p = rep.summary.pairs.filter((x) => x.paired);
  if (p.length) {
    const d = (k) => { const v = p.map((x) => x.delta[k]).filter((x) => x != null); return v.length ? sum(v) : null; };
    const sgn = (v, f) => (v == null ? '—' : (v > 0 ? '+' : '') + f(v));
    L.push('* delegate minus direct over ' + p.length + ' paired question(s): wall ' + sgn(d('wallMs'), secs) + ' · tool calls ' + sgn(d('toolCalls'), String) + ' · model calls ' + sgn(d('modelCalls'), String) + ' · worker cost ' + sgn(d('workerCostUsd'), usd));
  }
  return L.join('\n');
}

/** pairedCassettes(cassettes, only) → { questions: { id → { delegate, direct } }, problems } — the cassettes that carry an arm, by question */
export function pairedCassettes(cassettes, only) {
  const by = {}, problems = [];
  for (const c of cassettes) {
    if (!c.arm) continue;
    if (!c.question || !c.question.id) { problems.push(c.id + ': an arm cassette names the question it answers'); continue; }
    if (only && !only.has(c.question.id)) continue;
    const slot = by[c.question.id] || (by[c.question.id] = {});
    if (slot[c.arm]) problems.push(c.question.id + ': two cassettes for arm ' + c.arm + ' (' + slot[c.arm].id + ', ' + c.id + ')');
    slot[c.arm] = c;
  }
  for (const [id, s] of Object.entries(by)) for (const arm of ARMS) if (!s[arm]) problems.push(id + ': no ' + arm + ' cassette — a bench pair has both arms');
  return { questions: by, problems };
}

/** runOffline({ root, P, sets, only }) → report */
export async function runOffline({ root, P, sets, only }) {
  const { questions, problems } = pairedCassettes(loadCassettes(root), only);
  const rules = rulesOf(P);
  const rows = [], harness = problems.slice();
  for (const [qid, pair] of Object.entries(questions)) {
    for (const arm of ARMS) {
      const cas = pair[arm];
      if (!cas) continue;
      const bad = validateCassette(cas);
      const q = questionOf(sets, cas);
      if (!q) bad.push('names question ' + JSON.stringify(cas.question) + ', which the problem set does not have');
      else if (q.text !== cas.text) bad.push('was recorded for «' + cas.text + '» but the problem set now asks «' + q.text + '»');
      if (bad.length) { harness.push(...bad.map((b) => cas.id + ': ' + b)); rows.push({ arm, id: qid, measured: false, unmeasured: 'no_observation', detail: bad[0] }); continue; }
      const r = await replayCassette(cas, P);
      for (const dv of r.divergences) harness.push(cas.id + ': divergence (' + dv.kind + '): ' + dv.detail);
      rows.push(armRow(arm, judgeTurn(q, r.obs, rules), { modelCalls: r.obs.steps.length }));
    }
  }
  return { tool: 'scripts/atlas-delegation-bench.mjs', mode: 'offline', when: new Date().toISOString(), rows, summary: summarise(rows), harness };
}

/** the questions a bench asks by default: every answer-key row that is about research.delegate */
export function benchQuestions(only) {
  return askable('answers').filter((q) => (q.capabilities || []).indexOf(DELEGATE_CAPABILITY) >= 0 && (!only || only.has(q.id)));
}

async function runOnline({ url, token, only, headed, deadlineMs, rotatedOut }) {
  const rules = await productRules();
  const questions = benchQuestions(only);
  const patienceMs = rules.turnBudgetMs + 2 * rules.toolTimeoutMs;   /* the nightly's patience (scripts/atlas-eval.mjs) */
  const rows = [], harness = [];
  const t0 = Date.now();
  let S = null, rotated = null;
  try {
    S = await openAtlasSession({ url, token, headed, dryRun: false });
    if (S.fatal) harness.push(S.fatal);
    if (!S.who.signedIn) harness.push('not signed in — ' + S.session);
    const sections = sectionsRead(questions);
    let stop = '';
    for (const [i, q] of questions.entries()) {
      /* alternate which arm goes first, so a slow minute on the site does not always land on the same side */
      for (const arm of (i % 2 ? [...ARMS].reverse() : ARMS)) {
        const un = (why, detail) => rows.push(armRow(arm, judgeTurn(q, { measured: false, unmeasured: why, detail: detail || '' }, rules)));
        if (harness.length) { un('not_signed_in', harness[0]); continue; }
        if (stop) { un('not_reached', stop); continue; }
        if (deadlineMs && Date.now() - t0 + patienceMs > deadlineMs) { un('deadline'); continue; }
        const asked = prefixed(arm, q);
        const got = await askOnFreshPage(S, asked, { patienceMs, sections });
        if (got.unmeasured) { rows.push(armRow(arm, judgeTurn(q, got.unmeasured, rules))); continue; }
        /* the page's record holds the text that was asked, prefix included */
        const obs = observeTurn(Object.assign({}, q, { text: asked }), got.raw, got.askRes);
        if (!obs.measured && obs.unmeasured === 'gate_refused') stop = 'the page refused ' + q.id + ' before Atlas ran: ' + obs.detail;
        rows.push(armRow(arm, judgeTurn(q, obs, rules), { modelCalls: obs.aiCalls }));
      }
    }
    if (S.who.signedIn) rotated = await S.page.evaluate(PAGE.rotated);
  } catch (e) {
    harness.push('the page did not boot: ' + String((e && e.message) || e).split('\n')[0]);
  } finally {
    if (S) await S.browser.close().catch(() => { });
  }
  if (rotatedOut && rotated) writeFileSync(rotatedOut, rotated, { mode: 0o600 });   /* ⚠ never printed */
  return { tool: 'scripts/atlas-delegation-bench.mjs', mode: 'online', url, build: S && S.build, when: new Date().toISOString(), session: S && S.session, rows, summary: summarise(rows), harness };
}

async function main() {
  const argv = process.argv.slice(2);
  const has = (k) => argv.includes(k);
  const arg = (k, d = '') => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
  const only = arg('--questions') ? new Set(arg('--questions').split(',').map((s) => s.trim())) : null;
  const outDir = resolve(arg('--out', join(ROOT, 'test-results', 'atlas-delegation-bench')));
  let rep;
  if (has('--offline')) {
    const P = await productModules((p) => import(pathToFileURL(join(ROOT, p)).href));
    rep = await runOffline({ root: ROOT, P, sets: loadSets(ROOT), only });
  } else {
    const token = process.env.ATLAS_EVAL_REFRESH_TOKEN || '';
    if (!token) {
      /* the nightly's own message (scripts/atlas-eval.mjs), word for word but for the name */
      console.error('atlas-delegation-bench: ATLAS_EVAL_REFRESH_TOKEN is not set. A run without a session measures nothing —');
      console.error('            use --offline to replay the paired cassettes without one (docs/TESTING.md).');
      process.exit(2);
    }
    rep = await runOnline({ url: arg('--url', process.env.ATLAS_EVAL_URL || PROD_URL), token, only, headed: has('--headed'),
      deadlineMs: (+arg('--deadline-min', '0') || 0) * 60000, rotatedOut: arg('--rotated-token-out') });
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'delegation-bench.json'), JSON.stringify(rep, null, 2) + '\n');
  const table = renderTable(rep);
  writeFileSync(join(outDir, 'delegation-bench.md'), table + '\n');
  console.log(table);
  for (const h of rep.harness) console.error('  HARNESS  ' + h);
  console.log('  report: ' + join(outDir, 'delegation-bench.json'));
  /* a harness error is the only non-zero exit; being slow or dear is the result */
  const anyMeasured = rep.rows.some((r) => r.measured);
  process.exit(rep.harness.length || !anyMeasured ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
