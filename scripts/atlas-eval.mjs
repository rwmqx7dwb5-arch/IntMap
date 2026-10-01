#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ATLAS EVALUATION HARNESS — the questions #R775 and #R802 asked by hand, asked by a machine
 * ----------------------------------------------------------------------------
 *  Every Atlas evaluation so far was a person typing into the production page and reading
 *  `IntMapAtlasState.lastTurn()` (#R742 · #R747 · #R760 · #R775 · #R802). This drives the same page the
 *  same way — `IntMapConsole.run(q)` — and reads the same records, so what a round found by hand is
 *  measured again every night and a return of it opens ONE issue.
 *
 *      node scripts/atlas-eval.mjs [--url <site>] [--out <dir>] [--previous <report.json>]
 *                                  [--only id,id] [--screenshots] [--rotated-token-out <file>] [--headed]
 *      node scripts/atlas-eval.mjs --dry-run [--url <site>]       no question is sent; no session is made
 *      node scripts/atlas-eval.mjs --alarm <report.json> [--run-url <url>] [--print]
 *      node scripts/atlas-eval.mjs --replay                     (atlas-quality-lab) every cassette, no model, no browser
 *
 *  (atlas-quality-lab) ALSO, on a live run:
 *      --set records|answers|all   which problem set to ask (default all): the questions the manual rounds
 *                                  recorded (questions.json) and/or the verified answer key (answer-key.json)
 *      --rubric                    grade every answer-key reply with the INDEPENDENT grader (ai-proxy
 *                                  `atlas_grade`, a provider other than the one answering; one use per grade)
 *      --record <dir>              save every measured turn as a cassette (scripts/atlas-eval/replay.mjs) —
 *                                  the model's replies and what the dispatch returned — to replay with no model
 *      --deadline-min <n>          start no question that could not finish inside n minutes of the run's start
 *
 *  THE SESSION comes from ATLAS_EVAL_REFRESH_TOKEN (environment only). The page's own Supabase client
 *  exchanges it (`sb.auth.refreshSession`), so the harness never handles a password and never writes the
 *  token anywhere but `--rotated-token-out` — Supabase ROTATES refresh tokens, so the one that was used
 *  is spent and the next run needs the one the session holds at the end (docs/TESTING.md).
 *
 *  WHAT IS READ — nothing is copied out of the product, every reading is an existing observation port:
 *      window.IntMapAtlasState.lastTurn()   operations (capability, args, status, code, ms), status = the
 *                                           agent's `stopped`, reply
 *      window.IntMapAtlasDebug.lastPlan()   the steps and the names of the tool calls the model issued
 *      window.IntMapAtlasState.snapshot()   the `atlas` drawing, active layers, camera — the final map
 *      window.IntMapAtlasTools.makeExecute  WRAPPED, as #R802 wrapped it by hand, to see each executed
 *                                           call's arguments and the result the model received. The wrap
 *                                           changes nothing the call does or returns.
 *      window.IntMapRouteGeocode.suggest    R802 §6's place probes — NO MODEL CALL, so they run in --dry-run
 *
 *  THE RULES are in scripts/atlas-eval/judge.mjs (pure). The ones IntMap already keeps are imported from
 *  where it keeps them: CUT_STOPS and LIMITS from js/atlas-agent.js, callKey from js/atlas-turn-results.js.
 *
 *  EXIT  0 ok / dry run completed · 1 nothing could be measured, or the page did not boot · 2 usage
 *        (a non-dry run with no token) · 3 measured, and something regressed or a recorded defect is back
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  judgeTurn, judgeProbe, metricsOf, badnessOf, advance, verdictOf, renderMarkdown, validateQuestionSet,
} from './atlas-eval/judge.mjs';
import { rubricRequest, readRubric, validateAnswerKey } from './atlas-eval/grade.mjs';
import { goldenOf } from './atlas-eval/replay.mjs';
import { historyOf, renderTrend } from './atlas-eval/lab.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROD_URL = 'https://rwmqx7dwb5-arch.github.io/IntMap/';
export const ALARM_TITLE = 'Atlas evaluation (nightly) is red';

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const arg = (k, d = '') => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

/* The rules IntMap keeps, from where it keeps them. The modules touch `window` only inside try, and
   publish nothing we read here — the shim only gives those try blocks something to write to. */
async function productRules() {
  if (typeof globalThis.window === 'undefined') globalThis.window = {};
  const { makeAtlasAgent } = await import('../js/atlas-agent.js');
  const { makeAtlasTurnResults } = await import('../js/atlas-turn-results.js');
  const A = makeAtlasAgent();
  const TR = makeAtlasTurnResults({});
  return { cutStops: A.CUT_STOPS, turnBudgetMs: A.LIMITS.turnBudgetMs, toolTimeoutMs: A.LIMITS.toolTimeoutMs, callKey: TR.callKey };
}

export function loadQuestions() {
  return JSON.parse(readFileSync(join(ROOT, 'scripts/atlas-eval/questions.json'), 'utf8'));
}
/** (atlas-quality-lab) the verified answer key — questions with an objective answer and its source */
export function loadAnswerKey() {
  return JSON.parse(readFileSync(join(ROOT, 'scripts/atlas-eval/answer-key.json'), 'utf8'));
}
/** askable(which) — the questions a run asks, each tagged with the set it came from. An answer-key row
 *  judges by its answer (judge.mjs grades `q.answer`); it has no recorded expectations of its own. */
export function askable(which = 'all') {
  const out = [];
  if (which === 'all' || which === 'records') for (const q of loadQuestions().questions) out.push(Object.assign({ set: 'records' }, q));
  if (which === 'all' || which === 'answers') for (const q of loadAnswerKey().questions) out.push(Object.assign({ set: 'answers', sendable: true, expect: {}, unset: {} }, q));
  return out;
}

/* A result can be large (a research report). The JUDGE sees all of it; the stored report keeps a
   readable head of each — this is the size of the artefact, not an input to any verdict. */
const KEEP_RESULT_CHARS = 4000;
const trimCalls = (calls) => (calls || []).map((c) => ({ ...c, resultText: String(c.resultText || '').slice(0, KEEP_RESULT_CHARS) }));

/* ── in-page probes (serialised into the page by Playwright — they must be self-contained) ───────── */
const PAGE = {
  booted: () => !!(window.sb && window.IntMapAtlas && typeof window.IntMapAtlas.ensure === 'function'),
  build: () => (window.__imBuild || window.INTMAP_BUILD || null),
  session: async () => {
    try {
      const r = await window.sb.auth.getSession();
      const s = r && r.data && r.data.session;
      return { signedIn: !!s, user: s ? String(s.user && s.user.id || '').slice(0, 8) : null };
    } catch (e) { return { signedIn: false, error: String((e && e.message) || e) }; }
  },
  signIn: async (rt) => {
    try {
      const r = await window.sb.auth.refreshSession({ refresh_token: rt });
      return { ok: !!(r && r.data && r.data.session), error: r && r.error ? String(r.error.message || r.error) : '' };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  },
  rotated: async () => { try { const r = await window.sb.auth.getSession(); return (r && r.data && r.data.session && r.data.session.refresh_token) || null; } catch (_) { return null; } },
  ensureAtlas: async () => {
    try { await window.IntMapAtlas.ensure(); } catch (_) { }
    return {
      console: !!(window.IntMapConsole && typeof window.IntMapConsole.run === 'function'),
      state: !!(window.IntMapAtlasState && typeof window.IntMapAtlasState.lastTurn === 'function'),
      debug: !!(window.IntMapAtlasDebug && typeof window.IntMapAtlasDebug.lastPlan === 'function'),
      tools: !!(window.IntMapAtlasTools && typeof window.IntMapAtlasTools.makeExecute === 'function'),
      geocode: !!(window.IntMapRouteGeocode && typeof window.IntMapRouteGeocode.suggest === 'function'),
    };
  },
  tap: () => {
    const T = window.IntMapAtlasTools;
    if (!T || typeof T.makeExecute !== 'function') return false;
    window.__atlasEvalCalls = [];
    if (T.__atlasEvalTapped) return true;
    const orig = T.makeExecute;
    const text = (v) => { try { return JSON.stringify(v); } catch (_) { return String(v); } };
    const copy = (v) => { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } };
    T.makeExecute = function (tools, agent) {
      const ex = orig.call(this, tools, agent);
      return async function (call) {
        const rec = { name: String((call && call.name) || ''), args: copy(call && call.arguments), t0: Date.now() };
        (window.__atlasEvalCalls = window.__atlasEvalCalls || []).push(rec);
        try { const r = await ex.apply(this, arguments); rec.resultText = text(r); return r; }
        catch (e) { rec.resultText = text({ ok: false, status: 'failed', error: String((e && e.message) || e) }); throw e; }
        finally { rec.ms = Date.now() - rec.t0; delete rec.t0; }
      };
    };
    T.__atlasEvalTapped = true;
    return true;
  },
  ask: async (q) => {
    const t0 = Date.now(); let err = '';
    window.__atlasEvalCalls = [];
    try { await window.IntMapConsole.run(q); } catch (e) { err = String((e && e.message) || e); }
    return { ms: Date.now() - t0, err };
  },
  stop: () => { try { window.IntMapConsole.stopRun(); } catch (_) { } },
  observe: () => {
    const S = window.IntMapAtlasState, D = window.IntMapAtlasDebug;
    const t = S && S.lastTurn();
    let dbg = null; try { dbg = D && D.lastPlan(); } catch (_) { }
    let snap = null; try { snap = S.snapshot({ only: ['atlas', 'activeLayers', 'camera'] }); } catch (_) { }
    const b = document.querySelectorAll('.atl-b.a');
    return {
      turn: t ? {
        question: t.question, status: t.status, reply: t.reply || '', aiCalls: t.aiCalls,
        operations: (t.operations || []).map((o) => ({ capabilityId: o.capabilityId, args: o.args, status: o.status, code: o.code, ms: o.ms })),
      } : null,
      steps: (dbg && Array.isArray(dbg.steps)) ? dbg.steps.map((s) => ({ step: s.step, calls: s.calls || [] })) : [],
      stopped: dbg ? dbg.stopped : null,
      calls: window.__atlasEvalCalls || [],
      /* (atlas-quality-lab) the two sides of the turn js/atlas-console.js keeps for --record */
      replies: (dbg && Array.isArray(dbg.replies)) ? dbg.replies : null,
      dispatches: (dbg && Array.isArray(dbg.dispatches)) ? dbg.dispatches : null,
      snapshot: snap,
      lastBubble: b.length ? String(b[b.length - 1].innerText || '').slice(0, 400) : '',
    };
  },
  /* (atlas-quality-lab) the independent grade: ai-proxy `atlas_grade` with the page's own session, so it is
     charged and ledgered like every other call. The server chooses the grader (never the answering
     provider) and owns the schema — this sends only the question, the verified answer and the reply. */
  grade: async ({ system, prompt }) => {
    try {
      const cfg = window.INTMAP_AI_PROXY || {};
      if (!cfg.url) return { error: 'the page names no ai-proxy url' };
      const headers = { 'Content-Type': 'application/json' };
      if (cfg.headerName && cfg.headerValue) headers[cfg.headerName] = cfg.headerValue;
      if (window.SUPABASE_ANON_KEY) headers.apikey = window.SUPABASE_ANON_KEY;
      const ss = await window.sb.auth.getSession();
      const tok = ss && ss.data && ss.data.session && ss.data.session.access_token;
      if (!tok) return { error: 'no session' };
      headers.Authorization = 'Bearer ' + tok;
      const r = await fetch(cfg.url, { method: 'POST', headers, body: JSON.stringify({ task: 'atlas_grade', system, prompt, webMode: 'off', lang: 'en' }) });
      let j = null; try { j = await r.json(); } catch (_) { j = null; }
      if (!r.ok) return { error: (j && (j.error || j.message)) || ('HTTP ' + r.status) };
      let data = null; try { data = JSON.parse(String((j && j.text) || '').replace(/^\s*```(?:json)?|```\s*$/g, '')); } catch (_) { data = null; }
      const m = (j && j.meta) || {};
      return { data, model: m.modelServed || m.model || '', provider: m.provider || '' };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  },
  probe: async ({ asked, lang }) => {
    try {
      const r = await window.IntMapRouteGeocode.suggest(asked, { lang, limit: 3 });
      const it = (r && r.items && r.items[0]) || null;
      return { top: it ? { name: it.name || '', country: it.country || '', admin: it.admin || '', kind: it.kind || '', source: it.source || '' } : null, error: (r && r.error) || '' };
    } catch (e) { return { top: null, error: String((e && e.message) || e) }; }
  },
};

/* observeTurn(q, raw) — the page's records turned into what judge.mjs reads. Here and only here the
   harness decides 「was this turn measured at all」, from the records themselves. */
export function observeTurn(q, raw, askRes) {
  const t = raw && raw.turn;
  if (!t || t.question !== q.text) return { measured: false, unmeasured: 'no_observation', detail: 'IntMapAtlasState.lastTurn() holds no record of this question' };
  /* run() opened the record and returned before Atlas was called: the login gate or the daily allowance
     (js/atlas-console.js — the `_aiReady` branch leaves the record at 'running' with nothing done) */
  if (t.status === 'running' && !t.operations.length) return { measured: false, unmeasured: 'gate_refused', detail: raw.lastBubble };
  if (t.status === 'cancelled') return { measured: false, unmeasured: 'harness_timeout', detail: 'the turn was cancelled' };
  const names = (raw.steps || []).reduce((s, x) => s + ((x && x.calls) || []).length, 0);
  /* the tap is on the object the console used only if it saw the calls the steps say were made */
  const calls = (raw.calls && (raw.calls.length || !names)) ? raw.calls : null;
  return {
    measured: true, ms: askRes.ms, stopped: String(t.status || raw.stopped || ''), reply: t.reply,
    operations: t.operations, calls, steps: raw.steps, snapshot: raw.snapshot,
    replies: raw.replies || null, dispatches: raw.dispatches || null,
  };
}

/* (atlas-quality-lab) cassetteOf — one measured turn as a cassette scripts/atlas-eval/replay.mjs replays
   with no model: the model's replies, what the dispatch returned, the find_capability answers, the final
   map, and what the turn produced. A turn whose two sides were not both observed is not a cassette —
   a replay of half a turn would diverge on the half that is missing. */
export function cassetteOf(q, obs, judged, meta) {
  if (!obs || !obs.measured || !Array.isArray(obs.replies) || !Array.isArray(obs.dispatches) || !obs.calls) return null;
  const find = [];
  for (const c of obs.calls) if (c.name === 'find_capability') { try { find.push({ query: String((c.args && c.args.query) || ''), result: JSON.parse(c.resultText) }); } catch (_) { } }
  const kinds = [...new Set(judged.failures.map((f) => f.kind))];
  return {
    id: q.id + '-' + String(meta.when).slice(0, 10), text: q.text, lang: q.lang,
    origin: { kind: 'recorded', from: meta.url + (meta.build ? ' (build ' + meta.build + ')' : '') + ' ' + meta.when + (meta.runUrl ? ' ' + meta.runUrl : '') },
    question: { set: q.set || 'records', id: q.id }, recordedMs: obs.ms,
    model: obs.replies.map((r) => ({ final: !!r.final, text: r.text || '', turnState: r.turnState || '', answerMode: r.answerMode || '', webUsed: !!r.webUsed, toolCalls: r.toolCalls || [] })),
    world: { dispatch: obs.dispatches, find, snapshot: obs.snapshot || {} },
    golden: goldenOf({ stopped: obs.stopped, calls: obs.calls, text: obs.reply }),
    /* what the judge concluded live is what the replay must keep concluding */
    expect: { verdict: kinds.length ? 'fail' : 'pass', failures: kinds.length ? kinds : undefined, grade: judged.metrics.grade ? judged.metrics.grade.verdict : undefined },
  };
}

async function evaluate() {
  const dryRun = has('--dry-run');
  const url = arg('--url', process.env.ATLAS_EVAL_URL || PROD_URL);
  const outDir = resolve(arg('--out', join(ROOT, 'test-results', 'atlas-eval')));
  const only = arg('--only') ? new Set(arg('--only').split(',').map((s) => s.trim())) : null;
  const token = process.env.ATLAS_EVAL_REFRESH_TOKEN || '';
  if (!dryRun && !token) {
    console.error('atlas-eval: ATLAS_EVAL_REFRESH_TOKEN is not set. A run without a session measures nothing —');
    console.error('            use --dry-run to check the page and the place probes without one (docs/TESTING.md).');
    process.exit(2);
  }
  const set = loadQuestions();
  const rules = await productRules();
  const which = arg('--set', 'all');
  if (['all', 'records', 'answers'].indexOf(which) < 0) { console.error('atlas-eval: --set is all, records or answers'); process.exit(2); }
  const questions = askable(which).filter((q) => !only || only.has(q.id));
  const rubric = has('--rubric');
  const recordDir = arg('--record') ? resolve(arg('--record')) : '';
  const recorded = [];
  /* the run's own deadline: a question is started only if it can finish — see --deadline-min */
  const t0run = Date.now();
  const deadlineMs = (+arg('--deadline-min', '0') || 0) * 60000;
  const probeRows = (set.placeProbes && set.placeProbes.rows) || [];
  /* The harness's patience, not a limit on Atlas: a tool is abandoned at toolTimeoutMs and the turn budget
     is checked between steps, so a live turn ends inside turnBudgetMs plus one tool wait and the closing
     answer call. Twice the tool timeout on top covers both; waiting longer only means the page is stuck. */
  const patienceMs = rules.turnBudgetMs + 2 * rules.toolTimeoutMs;

  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: !has('--headed') });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
  const page = await context.newPage();
  const turns = [], probes = [];
  let build = null, session = '', rotated = null, fatal = '';

  const boot = async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(PAGE.booted, null, { timeout: 90000 });
  };
  try {
    await boot();
    build = await page.evaluate(PAGE.build);
    if (!dryRun) {
      const s = await page.evaluate(PAGE.signIn, token);
      if (!s.ok) session = 'the refresh token was refused — ' + (s.error || 'no session returned') + ' (a spent or revoked token; see docs/TESTING.md)';
      else await boot();   /* boot again so the app starts from the stored session, the way a returning reader does */
    }
    const who = await page.evaluate(PAGE.session);
    if (!session) session = who.signedIn ? 'signed in (user ' + who.user + '…)' : 'not signed in' + (who.error ? ' — ' + who.error : '');
    const ports = await page.evaluate(PAGE.ensureAtlas);
    await page.waitForFunction(() => !!(window.IntMapConsole && window.IntMapConsole.run), null, { timeout: 60000 }).catch(() => { });
    const missing = Object.entries(await page.evaluate(PAGE.ensureAtlas)).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) fatal = 'observation port(s) missing: ' + missing.join(', ') + ' (was ' + JSON.stringify(ports) + ')';

    /* the place probes: no model call, no session needed — they run in every mode */
    for (const row of probeRows) {
      if (fatal || only) { probes.push(judgeProbe(row, { measured: false, unmeasured: fatal ? 'no_observation' : 'not_reached' })); continue; }
      const o = await page.evaluate(PAGE.probe, { asked: row.asked, lang: set.placeProbes.lang || 'en' });
      probes.push(judgeProbe(row, { measured: true, top: o.top, error: o.error }));
    }

    let stopAll = '';
    for (const q of questions) {
      if (!q.sendable) { turns.push(judgeTurn(q, null, rules)); continue; }
      if (fatal) { turns.push(judgeTurn(q, { measured: false, unmeasured: 'no_observation', detail: fatal }, rules)); continue; }
      if (!who.signedIn) { turns.push(judgeTurn(q, { measured: false, unmeasured: 'not_signed_in', detail: who.error || (/refused/.test(session) ? session : '') }, rules)); continue; }
      if (dryRun) { turns.push(judgeTurn(q, { measured: false, unmeasured: 'dry_run' }, rules)); continue; }
      if (stopAll) { turns.push(judgeTurn(q, { measured: false, unmeasured: 'not_reached', detail: stopAll }, rules)); continue; }
      if (deadlineMs && Date.now() - t0run + patienceMs > deadlineMs) { turns.push(judgeTurn(q, { measured: false, unmeasured: 'deadline', detail: 'started ' + Math.round((Date.now() - t0run) / 60000) + ' min into a ' + Math.round(deadlineMs / 60000) + '-min run' }, rules)); continue; }
      /* each question on a fresh page: a turn is judged on what IT did, not on what the previous turn — or
         the place probes, which set the geocoder's language — left behind */
      await boot(); await page.evaluate(PAGE.ensureAtlas);
      await page.waitForFunction(() => !!(window.IntMapConsole && window.IntMapConsole.run), null, { timeout: 60000 });
      await page.evaluate(PAGE.tap);
      let askRes, timer = null;
      const asking = page.evaluate(PAGE.ask, q.text);
      asking.catch(() => { });   /* if the watchdog wins, the next boot() rejects this one — that is not an error */
      try {
        askRes = await Promise.race([asking, new Promise((r) => { timer = setTimeout(() => r({ timedOut: true }), patienceMs); })]);
      } catch (e) { askRes = { err: String((e && e.message) || e) }; }
      finally { clearTimeout(timer); }
      if (askRes.timedOut) { await page.evaluate(PAGE.stop).catch(() => { }); turns.push(judgeTurn(q, { measured: false, unmeasured: 'harness_timeout', detail: 'no end after ' + Math.round(patienceMs / 1000) + ' s' }, rules)); continue; }
      if (askRes.err && !Number.isFinite(askRes.ms)) { turns.push(judgeTurn(q, { measured: false, unmeasured: 'page_error', detail: askRes.err }, rules)); continue; }
      const raw = await page.evaluate(PAGE.observe);
      const obs = observeTurn(q, raw, askRes);
      /* (atlas-quality-lab) the independent grade — only for a question with a verified answer, only when
         asked for (it costs a use), and never for an empty reply (there is nothing to grade; the
         deterministic grade already says 「absent」) */
      if (rubric && q.answer && obs.measured) {
        if (!String(obs.reply || '').trim()) obs.rubric = { measured: false, reason: 'no reply to grade' };
        else {
          const g = await page.evaluate(PAGE.grade, rubricRequest(q, obs.reply)).catch((e) => ({ error: String((e && e.message) || e) }));
          obs.rubric = g.error ? { measured: false, reason: 'grader: ' + g.error } : Object.assign(readRubric(g.data), { model: g.model, provider: g.provider });
        }
      }
      const judged = judgeTurn(q, obs, rules);
      if (recordDir) { const c = cassetteOf(q, obs, judged, { url, build, when: new Date().toISOString(), runUrl: arg('--run-url') || '' }); if (c) recorded.push(c); }
      if (obs.measured) judged.record = { operations: obs.operations, calls: obs.calls ? trimCalls(obs.calls) : null, steps: obs.steps, reply: obs.reply, snapshot: obs.snapshot };
      turns.push(judged);
      if (!obs.measured && obs.unmeasured === 'gate_refused') stopAll = 'the page refused ' + q.id + ' before Atlas ran: ' + obs.detail;
      if (has('--screenshots')) { mkdirSync(outDir, { recursive: true }); await page.screenshot({ path: join(outDir, q.id + '.png') }).catch(() => { }); }
    }
    if (!dryRun && who.signedIn) rotated = await page.evaluate(PAGE.rotated);
  } catch (e) {
    fatal = fatal || ('the page did not boot: ' + String((e && e.message) || e).split('\n')[0]);
    for (const q of questions.slice(turns.length)) turns.push(judgeTurn(q, { measured: false, unmeasured: 'page_error', detail: fatal }, rules));
    for (const row of probeRows.slice(probes.length)) probes.push(judgeProbe(row, { measured: false, unmeasured: 'page_error', detail: fatal }));
  } finally {
    await browser.close().catch(() => { });
  }

  /* against the previous report: the reference moves only when a fact did not get worse (judge.mjs advance) */
  let previous = null;
  const prevPath = arg('--previous');
  if (prevPath && existsSync(prevPath)) { try { previous = JSON.parse(readFileSync(prevPath, 'utf8')); } catch (_) { previous = null; } }
  const partial = !!only;   /* a partial run must not rewrite the reference of the questions it skipped — nor adopt a new one */
  const bad = badnessOf(turns, probes);
  const adv = advance(previous && previous.reference, bad);
  const verdict = fatal && !dryRun ? 'unmeasured' : verdictOf({ dryRun, turns, probes, regressions: adv.regressions });
  const report = {
    tool: 'scripts/atlas-eval.mjs', version: set.version, url, build, when: new Date().toISOString(),
    runUrl: arg('--run-url') || null, dryRun, partial, session, fatal: fatal || null, verdict,
    metrics: metricsOf(turns, probes),
    previous: previous ? { when: previous.when, runUrl: previous.runUrl || null, verdict: previous.verdict } : null,
    regressions: adv.regressions, improvements: adv.improvements,
    reference: (dryRun || partial) ? ((previous && previous.reference) || {}) : adv.reference,
    turns, probes,
  };
  /* (atlas-quality-lab) the time series travels in the report itself: the previous night's history with
     tonight appended (lab.mjs historyOf — a dry or partial run appends nothing) */
  report.history = historyOf(previous, report);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'atlas-eval.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(outDir, 'atlas-eval.md'), renderMarkdown(report) + '\n\n' + renderTrend(report.history) + '\n');
  if (recordDir) {
    mkdirSync(recordDir, { recursive: true });
    for (const c of recorded) writeFileSync(join(recordDir, c.id + '.json'), JSON.stringify(c, null, 2) + '\n');
    console.log('  recorded ' + recorded.length + ' cassette(s) → ' + recordDir + ' (copy the ones worth keeping into scripts/atlas-eval/cassettes/)');
  }
  const rtOut = arg('--rotated-token-out');
  if (rtOut && rotated) writeFileSync(rtOut, rotated, { mode: 0o600 });   /* ⚠ never printed */

  const M = report.metrics;
  console.log('atlas-eval: ' + verdict + ' — ' + url + (build ? ' (build ' + build + ')' : ''));
  console.log('  session: ' + session);
  if (fatal) console.log('  ' + fatal);
  console.log('  turns: ' + M.measured + ' measured of ' + M.questions + (Object.keys(M.unmeasured).length ? ' · not measured: ' + Object.entries(M.unmeasured).map(([k, n]) => k + ' ×' + n).join(', ') : ''));
  console.log('  probes: ' + M.misresolution.probesMeasured + ' measured · misresolved: ' + (M.misresolution.probes.join(', ') || 'none'));
  if (M.answers.graded) console.log('  answers right ' + M.answers.correct + '/' + M.answers.graded + ' (wrong ' + M.answers.incorrect + ', not stated ' + M.answers.absent + ')' + (M.answers.rubric.graded ? ' · grader pass ' + M.answers.rubric.pass + '/' + M.answers.rubric.graded : ''));
  if (M.answers.graded) console.log('  answers right ' + M.answers.correct + '/' + M.answers.graded + ' (wrong ' + M.answers.incorrect + ', not stated ' + M.answers.absent + ')' + (M.answers.rubric.graded ? ' · grader pass ' + M.answers.rubric.pass + '/' + M.answers.rubric.graded : ''));
  if (M.measured) console.log('  reach ' + M.reach.reached + '/' + M.reach.of + ' · zero-op ' + M.zeroOpTurns.length + ' · cut ' + M.cutTurns.n + ' · same call again ' + M.secondOfSameOp.total + ' · over budget ' + M.overBudgetTurns.length);
  if (adv.regressions.length) console.log('  regressions: ' + adv.regressions.map((x) => x.key).join(', '));
  console.log('  report: ' + join(outDir, 'atlas-eval.md'));
  if (dryRun) process.exit(fatal ? 1 : 0);
  process.exit(verdict === 'ok' ? 0 : verdict === 'regressed' ? 3 : 1);
}

/* ── the alarm: ONE issue, rewritten with the latest verdict, closed when a run is clean ──────────
   The shape is scripts/deep-alarm.mjs's (#R304): a state, not a log — never a comment a night. */
const GH_BODY_MAX = 65536;   /* GitHub's own limit on an issue body (characters); a longer body is refused whole */
function alarm() {
  const path = arg('--alarm');
  let report = null; try { report = JSON.parse(readFileSync(path, 'utf8')); } catch (_) { report = null; }
  const verdict = report ? report.verdict : 'no-report';
  const runUrl = arg('--run-url') || (report && report.runUrl) || '';
  /* a step before the evaluation can say why there is no report (the workflow's secret gate does) */
  let why = ''; try { why = arg('--why-file') ? readFileSync(arg('--why-file'), 'utf8').trim() : ''; } catch (_) { why = ''; }
  let body = report ? renderMarkdown(Object.assign({}, report, { runUrl: runUrl || report.runUrl })) + '\n\n' + renderTrend(report.history) : [
    '# Atlas evaluation — no report', '', '* run: ' + (runUrl || '(unknown)'), '',
    why || 'The evaluation step produced no report, so nothing was measured tonight — read the run log.',
  ].join('\n');
  body += '\n\nThis issue is opened, rewritten and closed by `scripts/atlas-eval.mjs --alarm` from the nightly `.github/workflows/atlas-eval.yml`.';
  if (body.length > GH_BODY_MAX) body = body.slice(0, GH_BODY_MAX - 200) + '\n\n… (cut to fit GitHub\'s issue body limit — the full report is the run\'s artifact)';
  console.log('atlas-eval alarm: verdict = ' + verdict);
  if (has('--print') || verdict === 'dry-run') { console.log(body); return; }
  const gh = (a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let num = null;
  try { const list = JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '50', '--json', 'number,title'])); const hit = list.find((i) => i.title === ALARM_TITLE); num = hit ? hit.number : null; } catch (_) { num = null; }
  if (verdict === 'ok') {
    if (num == null) { console.log('atlas-eval alarm: clean, and nothing is open.'); return; }
    gh(['issue', 'comment', String(num), '--body', 'Clean again — ' + (runUrl || 'the nightly run') + ' (' + new Date().toISOString().slice(0, 10) + ').']);
    gh(['issue', 'close', String(num)]);
    console.log('atlas-eval alarm: clean — closed #' + num + '.');
    return;
  }
  if (num == null) console.log('atlas-eval alarm: opened ' + gh(['issue', 'create', '--title', ALARM_TITLE, '--body', body]));
  else { gh(['issue', 'edit', String(num), '--body', body]); console.log('atlas-eval alarm: rewrote #' + num + '.'); }
}

function validate() {
  const set = loadQuestions();
  const key = loadAnswerKey();
  return productRules().then(async () => {
    const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
    const C = makeAtlasCapabilities({});
    const has = (id) => !!C.resolve(id);
    const bad = validateQuestionSet(set, has).concat(validateAnswerKey(key, has));
    /* one id names one question across both sets — a report row and a cassette refer to it by id alone */
    const seen = new Set(set.questions.map((q) => q.id));
    for (const q of key.questions) if (seen.has(q.id)) bad.push('id «' + q.id + '» is in both questions.json and answer-key.json');
    return bad;
  });
}

/* (atlas-quality-lab) --replay: every cassette, through the current code, judged — no model, no browser */
async function replayAll() {
  const { productModules } = await import('./atlas-eval/replay.mjs');
  const { evaluateCassettes, loadCassettes, loadSets, renderReplay } = await import('./atlas-eval/lab.mjs');
  const { pathToFileURL } = await import('node:url');
  const P = await productModules((p) => import(pathToFileURL(join(ROOT, p)).href));
  const res = await evaluateCassettes(loadCassettes(ROOT), { P, sets: loadSets(ROOT) });
  const md = renderReplay(res);
  const outDir = resolve(arg('--out', join(ROOT, 'test-results', 'atlas-eval')));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'replay.md'), md + '\n');
  console.log(md);
  return res.some((r) => r.problems.length) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (has('--alarm')) alarm();
  else if (has('--replay')) process.exit(await replayAll());
  else if (has('--validate')) {
    const bad = await validate();
    if (bad.length) { for (const b of bad) console.log('  FAIL  ' + b); process.exit(1); }
    console.log('atlas-eval: the problem set is well formed');
  } else await evaluate();
}
