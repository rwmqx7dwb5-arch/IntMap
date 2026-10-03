/* ============================================================================
 *  scripts/lib/nightly-status.mjs — WHAT THE NIGHTLY JOBS LAST SAID, AS DATA   (shell-experience)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-03, BEFORE THIS FILE:
 *    · .github/workflows/upstream-liveness.yml classified 113 hosts every night into a 90-day artifact,
 *      and nothing a reader sees read it. On the night of 2026-10-02 six were not answering —
 *      api.gdeltproject.org (429), api-v2.oec.world (403), celestrak.org, overpass-api.de and both
 *      Overpass mirrors — and the layers behind them showed the reader an empty map, or a pill saying
 *      only 「読み込めません」, with no word that the supplier had been silent for a day.
 *    · .github/workflows/atlas-eval.yml had run EIGHT times (its whole history: the runs API's
 *      `total_count` is 8) and every one stopped at its first step — 「missing repository secret(s):
 *      ATLAS_EVAL_REFRESH_TOKEN ATLAS_EVAL_SECRET_WRITER. Nothing was measured.」 — and uploaded no
 *      report. `node scripts/worktree.mjs status` did not say so; a red cross in `gh run list` among
 *      dozens of runs a day is the 「nobody reads it」 the workflow's own header warns about.
 *
 *  This module turns both into data, in two halves:
 *    PURE  — readerUpstreams(result, ledger) and atlasEvalState(runs, details): no network, no fs;
 *            tests/shell-experience-checks.test.mjs evaluates them directly.
 *    GH    — ghJSON(args, timeoutMs) and fetchAtlasEval(repo, opt): ask GitHub through the `gh` CLI
 *            with a deadline, and answer null — never throw — when gh is missing, logged out, offline
 *            or slow (scripts/worktree.mjs's rule: `status` never makes a session wait or fail).
 *  Readers: scripts/build-service-status.mjs (writes data/status/service-status.json, which the app's
 *  status page and the layer rows read) and scripts/worktree.mjs (prints the Atlas evaluation line).
 *
 *  ⚠ 「測っていない」 IS NOT 「赤」 AND NOT 「緑」. A run that uploaded no report measured nothing, and
 *  atlasEvalState says that in its own field (`measured`), apart from the run's conclusion — the
 *  distinction .agents/rules/one-pass-or-a-reason.md §5 draws between failing and not observing.
 * ==========================================================================*/
import { spawnSync } from 'node:child_process';

/* ── pure: the upstreams a reader is told about ───────────────────────────────────────────────── */

/**
 * The reader's digest of one upstream-liveness result. Every probed host appears, alive or not,
 * with the words the reader is shown for it (the ledger's `what` / `whatJp`) — a host with no row in
 * the ledger is reported by name only, never given words nobody wrote.
 * @returns {{ measuredAt, comparedWith, networkObserved, counts, hosts: object[] } | null}
 */
export function readerUpstreams(result, ledger) {
  if (!result || !Array.isArray(result.hosts)) return null;
  const rows = new Map(((ledger && ledger.hosts) || []).map((r) => [r.host, r]));
  const hosts = result.hosts.map((h) => {
    const r = rows.get(h.host) || {};
    const out = { host: h.host, verdict: h.verdict, why: h.why || null, status: h.status == null ? null : h.status };
    if (r.what) out.what = r.what;
    if (r.whatJp) out.whatJp = r.whatJp;
    if (r.group) out.group = r.group;   /* (ops-next) «build»: a service a layer is rebuilt from, not one the browser asks */
    /* a host that answered tonight last answered tonight — the result's own clock, nothing invented */
    out.lastAlive = h.verdict === 'alive' ? result.measuredAt : (h.lastAlive || null);
    if (h.verdict === 'dead' || h.verdict === 'refused') {
      out.downSince = h.downSince || null;
      out.runs = Number.isInteger(h.streak) ? h.streak : null;
      /* A result written before scripts/upstream-liveness.mjs carried these two fields still states
         them through its own streak: down for 1 run after being up ⇒ the previous run saw it alive and
         this run is the first down one; down for 2 after being up ⇒ the previous run was the first down
         one. Nothing beyond what the streak itself says is inferred. */
      const prevAt = (result.transitions && result.transitions.comparedWith) || null;
      if (h.from === 'up' && h.streak === 1) {
        if (!out.lastAlive && prevAt) out.lastAlive = prevAt;
        if (!out.downSince) out.downSince = result.measuredAt || null;
      } else if (h.from === 'up' && h.streak === 2 && !out.downSince && prevAt) out.downSince = prevAt;
    }
    return out;
  }).sort((a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return {
    measuredAt: result.measuredAt || null,
    comparedWith: (result.transitions && result.transitions.comparedWith) || null,
    networkObserved: result.networkObserved !== false,
    counts: result.counts || null,
    hosts,
  };
}

/* ── pure: the Atlas evaluation ───────────────────────────────────────────────────────────────── */

/* (ops-next) the two reports atlas-eval.yml uploads: the live evaluation's, and the half that needs no session */
export const LIVE_REPORT = 'atlas-eval-report';
export const OFFLINE_REPORT = 'atlas-eval-offline';

/* The platform's own line every failed step adds; it says a step failed, not why. */
const GENERIC = /^Process completed with exit code \d+\.?$/;

/**
 * @param {{ total: number, runs: { id, conclusion, status, createdAt, url, event }[] }} list  newest first
 * @param {{ [id: string]: { report: boolean|null, why: string[], step: string|null } }} details  per run, when asked
 * @returns the state, or null when there was nothing to read
 */
export function atlasEvalState(list, details) {
  if (!list || !Array.isArray(list.runs)) return null;
  const done = list.runs.filter((r) => r && r.status === 'completed');
  const d = details || {};
  const success = done.find((r) => r.conclusion === 'success') || null;
  const withReport = done.find((r) => d[r.id] && d[r.id].report === true) || null;
  const withOffline = done.find((r) => d[r.id] && d[r.id].offline === true) || null;
  const latest = done[0] || null;
  let streak = 0;
  for (const r of done) { if (r.conclusion === 'success') break; streak++; }
  const L = latest ? (d[latest.id] || {}) : {};
  return {
    total: Number.isInteger(list.total) ? list.total : done.length,
    window: done.length,
    windowFrom: done.length ? done[done.length - 1].createdAt : null,
    lastSuccessAt: success ? success.createdAt : null,
    lastReportAt: withReport ? withReport.createdAt : null,
    /* (ops-next) the newest run that uploaded the half needing no session — scripts/build-service-status.mjs reads it */
    offlineRun: withOffline ? { id: withOffline.id, at: withOffline.createdAt } : null,
    failingRuns: streak,
    latest: latest ? {
      at: latest.createdAt, conclusion: latest.conclusion, url: latest.url || null, event: latest.event || null,
      /* null = not asked; false = asked, and the run uploaded no report — it measured nothing */
      measured: L.report == null ? null : L.report === true,
      step: L.step || null,
      why: Array.isArray(L.why) ? L.why : [],
    } : null,
  };
}

/** one line of Japanese for scripts/worktree.mjs — the operator's language (AGENTS.md §10) */
export function atlasEvalLine(s) {
  if (!s) return null;
  const day = (t) => String(t || '').slice(0, 10);
  const last = s.lastSuccessAt ? `最後の成功 ${day(s.lastSuccessAt)}` : `成功 0 回（全 ${s.total} 回${s.windowFrom ? `・${day(s.windowFrom)} 以降` : ''}）`;
  const L = s.latest;
  if (!L) return { ok: false, text: `Atlas 夜間評価: 走った記録が無い` };
  const ok = L.conclusion === 'success';
  const head = ok ? `最新 ${day(L.at)} 緑` : `最新 ${day(L.at)} ${L.measured === false ? '評価の前に停止（何も測っていない）' : L.conclusion === 'cancelled' ? '中断' : '赤'}`;
  const why = !ok && L.why.length ? `: ${L.why[0]}` : '';
  return { ok: ok && s.failingRuns === 0, text: `Atlas 夜間評価: ${last} / ${head}${why}${!ok && s.failingRuns > 1 ? `（${s.failingRuns} 回続けて）` : ''}`, url: L.url };
}

/* ── GitHub, through the gh CLI ───────────────────────────────────────────────────────────────── */

/** gh … → parsed JSON, or null (no gh, not logged in, offline, slower than the deadline) */
export function ghJSON(args, { cwd, timeoutMs = 6000 } = {}) {
  try {
    const r = spawnSync('gh', args, { cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status !== 0 || !r.stdout) return null;
    return JSON.parse(r.stdout);
  } catch { return null; }
}

/** the repository `owner/name` gh resolves for this checkout, or null */
export function ghRepo(opt = {}) {
  const j = ghJSON(['repo', 'view', '--json', 'nameWithOwner'], opt);
  return j && j.nameWithOwner ? j.nameWithOwner : null;
}

/**
 * Read the evaluation's runs and, for the newest completed one (and the newest success, if any),
 * whether it uploaded a report and what its failing step said. `detailRuns` bounds how many runs are
 * looked into beyond the list (each costs two or three calls).
 */
export function fetchAtlasEval(repo, { cwd, timeoutMs = 6000, perPage = 30, detailRuns = 1, workflow = 'atlas-eval.yml' } = {}) {
  if (!repo) return null;
  const o = { cwd, timeoutMs };
  const page = ghJSON(['api', `repos/${repo}/actions/workflows/${workflow}/runs?per_page=${perPage}`], o);
  if (!page || !Array.isArray(page.workflow_runs)) return null;
  const list = {
    total: page.total_count,
    runs: page.workflow_runs.map((r) => ({ id: r.id, conclusion: r.conclusion, status: r.status, createdAt: r.created_at, url: r.html_url, event: r.event })),
  };
  const details = {};
  const done = list.runs.filter((r) => r.status === 'completed');
  for (const r of done.slice(0, detailRuns)) details[r.id] = runDetail(repo, r.id, o);
  return atlasEvalState(list, details);
}

function runDetail(repo, id, o) {
  const out = { report: null, why: [], step: null };
  const arts = ghJSON(['api', `repos/${repo}/actions/runs/${id}/artifacts`], o);
  /* ⚠ (ops-next) «a report» is THE LIVE REPORT, by name. Since the run also uploads `atlas-eval-offline` (the
     half that needs no session, measured every night), «any artifact» would call a run that measured nothing
     live «measured». The offline report is named apart, for scripts/build-service-status.mjs to read. */
  if (arts && Array.isArray(arts.artifacts)) {
    out.report = arts.artifacts.some((x) => x.name === LIVE_REPORT && !x.expired);
    const off = arts.artifacts.find((x) => x.name === OFFLINE_REPORT && !x.expired);
    out.offline = off ? true : false;
  }
  const jobs = ghJSON(['api', `repos/${repo}/actions/runs/${id}/jobs`], o);
  /* every job that did not succeed speaks — the offline job and the live one fail for different reasons */
  const failed = jobs && Array.isArray(jobs.jobs) ? jobs.jobs.filter((j) => j.conclusion && j.conclusion !== 'success') : [];
  for (const job of failed) {
    const st = (job.steps || []).find((s) => s.conclusion === 'failure');
    if (!out.step) out.step = st ? st.name : null;
    const ann = ghJSON(['api', `repos/${repo}/check-runs/${job.id}/annotations`], o);
    if (Array.isArray(ann)) out.why = out.why.concat(ann.filter((a) => a.annotation_level === 'failure' && !GENERIC.test(String(a.message || '').trim())).map((a) => String(a.message).trim()));
  }
  return out;
}
