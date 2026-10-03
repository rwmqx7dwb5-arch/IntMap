#!/usr/bin/env node
/* ============================================================================
 *  scripts/build-service-status.mjs — data/service-status.json   (shell-experience)
 * ----------------------------------------------------------------------------
 *  WHAT THE NIGHTLY MEASUREMENTS SAID, SHIPPED WHERE THE READER CAN READ THEM. Two jobs measure
 *  things a reader of the map is affected by and, before this file, only an operator with `gh` could
 *  see (scripts/lib/nightly-status.mjs has the measurement):
 *    · upstream-liveness.yml — which of the hosts the browser asks are answering, refusing or silent,
 *      and since when (its artifact `upstream-liveness`, kept 90 days);
 *    · atlas-eval.yml — when the production Atlas was last evaluated, and why it was not.
 *  The app reads the bundle in three places (js/service-status.js): the status page, the sentence a
 *  layer row adds when its request fails (「データ元は 10/02 から応答していません」), and the rows of
 *  the data-sources list.
 *
 *  HOW IT REACHES THE SITE. main is ruleset-protected and the only unattended path onto it is the bot
 *  pull request of .github/workflows/tle-refresh.yml (its header has the whole measurement). That job
 *  runs this script twice a day and carries data/service-status.json in the same pull request as the catalogue.
 *  ⚠ The bundle is rewritten only when what it SAYS changed (`builtAt` excluded), so a night with
 *  nothing new proposes nothing.
 *
 *  ⚠ NOTHING HERE IS A DEFAULT. A half that could not be read (gh missing, the artifact expired, the
 *  API slow) is written as `null` with the reason in `unread`, and the page says 「読めなかった」 —
 *  it never repeats an older answer as if it were tonight's, and never calls silence green.
 *
 *  ══ (ops-next) THE HISTORY — A PUBLIC LEDGER, NOT ONE NIGHT'S PHOTOGRAPH ═════════════════════════
 *  Before this, the bundle said only what the LAST night measured, so a reader could not tell a source
 *  that failed once from one that has failed for a month, and «how reliable is this map's data» had no
 *  answer anywhere a reader could look. `history` carries every measured night forward (advanceHistory):
 *  one character per host per night, in the order the nights were measured —
 *      a alive · r refused · d dead · u unobserved (the probe could not tell) · . not probed that night
 *  ⚠ ONLY MEASURED NIGHTS ARE NIGHTS. A night is added when the liveness result has a `measuredAt` the
 *  history does not already hold; a run that read nothing adds nothing (it is not a night of «unknown»
 *  the reader would take for a gap the suppliers caused). A measurement whose checking machine had no
 *  network is kept as a night with every host `u` — it happened, and it said nothing about anyone.
 *  The first nights were folded in by `--backfill` from the results GitHub still kept (90 days).
 *
 *  Run:
 *    node scripts/build-service-status.mjs                       read both through gh, write the bundle
 *    node scripts/build-service-status.mjs --backfill            also fold every unexpired older result into the history
 *    node scripts/build-service-status.mjs --liveness r.json     use this upstream-liveness result
 *    node scripts/build-service-status.mjs --print               print, write nothing
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readerUpstreams, fetchAtlasEval, ghJSON, ghRepo, OFFLINE_REPORT } from './lib/nightly-status.mjs';
import { measureQuality } from '../js/data-governance.js';
import { buildProbes, BUILD_UPSTREAMS } from './upstream-liveness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'data/service-status.json';
const LEDGER = 'scripts/outbound-hosts.json';

/* (#729) the governance record — check:datagov reads it. The bundle is IntMap's OWN measurement of
   third parties, not a third party's data: the publisher is this repository and no supplier's terms
   travel with it (every row is a verdict this repository's probe reached, plus the ledger's own words). */
/* the facts every record states the same way — the bundle carries them in-band, the builder declares them */
const TERMS = {
  publisher: 'IntMap (scripts/upstream-liveness.mjs, .github/workflows/atlas-eval.yml)',
  url: 'https://github.com/rwmqx7dwb5-arch/IntMap/actions',
  licence: 'IntMap — Personal & Research Use License (LICENSE)',
  licenceUrl: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/LICENSE',
  attribution: false,
  cadence: 'P1D',
  builtBy: 'scripts/build-service-status.mjs',
  schema: 'intmap-service-status/1',
};
/* ⚠ WHEN AND HOW COMPLETE a bundle is are facts of a RUN — generatedAt, retrievedAt, asOf and the
   quality counts — so the bundle states them in-band (compose() below) and this declaration, which
   check:datagov reads apart from any run, cannot: they are recorded in data/governance-ledger.json as
   undeclared here for that reason, like every other builder's run-time facets. */
export const GOVERNANCE = {
  [OUT]: {
    ...TERMS,
    /* ⚠ THE CADENCE IS THE MEASUREMENT'S OWN: both jobs are scheduled once a day
       (upstream-liveness.yml cron 04:41 UTC, atlas-eval.yml 05:41 UTC). */
    cadenceBasis: {
      observed: 'the two workflows this bundle reads are each scheduled once a day (their `cron` lines)',
      expires: 'if either schedule changes — then this record states a period the measurement no longer has',
      canon: 'the `on.schedule` of .github/workflows/upstream-liveness.yml and atlas-eval.yml',
    },
  },
};

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const has = (k) => process.argv.includes(k);

/* the completed upstream-liveness runs that can carry a result, newest first */
function livenessRuns(repo, limit) {
  const runs = ghJSON(['run', 'list', '--repo', repo, '--workflow', 'upstream-liveness.yml', '--status', 'completed',
    '--limit', String(limit), '--json', 'databaseId,conclusion,createdAt'], { cwd: ROOT, timeoutMs: 20000 });
  return Array.isArray(runs) ? runs.filter((r) => r.conclusion === 'success' || r.conclusion === 'failure') : null;
}

/** the newest completed upstream-liveness result, downloaded through gh into a temporary directory */
function latestLiveness(repo) {
  const runs = livenessRuns(repo, 10);
  if (!runs) return { result: null, why: 'gh could not list the upstream-liveness runs' };
  if (!runs[0]) return { result: null, why: 'no completed upstream-liveness run' };
  return livenessOf(repo, runs[0]);
}

/** (ops-next) every older result GitHub still keeps, oldest first — what --backfill folds into the history */
function olderLiveness(repo) {
  const runs = livenessRuns(repo, 100) || [];
  return runs.slice(1).reverse().map((run) => livenessOf(repo, run).result).filter(Boolean);
}

/** one run's result, downloaded through gh into a temporary directory */
function livenessOf(repo, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intmap-service-status-'));
  try {
    const r = ghJSON(['api', `repos/${repo}/actions/runs/${run.databaseId}/artifacts`], { cwd: ROOT, timeoutMs: 20000 });
    if (!r || !Array.isArray(r.artifacts) || !r.artifacts.some((a) => a.name === 'upstream-liveness' && !a.expired)) {
      return { result: null, why: `run ${run.databaseId} has no unexpired upstream-liveness artifact` };
    }
    /* gh run download prints nothing machine-readable; success is the file being there */
    ghJSON(['run', 'download', String(run.databaseId), '--repo', repo, '--name', 'upstream-liveness', '--dir', dir], { cwd: ROOT, timeoutMs: 60000 });
    const f = path.join(dir, 'upstream-liveness.json');
    if (!fs.existsSync(f)) return { result: null, why: `the artifact of run ${run.databaseId} could not be downloaded` };
    return { result: JSON.parse(fs.readFileSync(f, 'utf8')), why: null };
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } }
}

/**
 * (ops-next) THE WORDS FOR EVERY ROW THE NIGHTLY CHECK MEASURES. upstream-liveness.mjs measures two
 * universes: the hosts the reader's browser asks (scripts/outbound-hosts.json, with `what` / `whatJp`)
 * and, since companies-elections-live, the services the elections layer is REBUILT from
 * (scripts/elections/upstreams.json, identity «elections/<pack>: <host>»). Measured 2026-10-03: the first
 * night that carried the second universe put 25 rows into this bundle with no words, and
 * tests/shell-experience-checks.test.mjs ⑦ («only hosts the ledger knows») went red on the rebuilt bundle —
 * so tonight's bot pull request could not have landed. The build rows are told by their own declaration:
 * the pack's publisher and what the pack reads there. The identity is buildProbes()'s, never re-spelled.
 */
export function readerLedger(root) {
  const ledger = JSON.parse(fs.readFileSync(path.join(root, LEDGER), 'utf8'));
  const bf = path.join(root, BUILD_UPSTREAMS);
  if (!fs.existsSync(bf)) return ledger;
  const { probes } = buildProbes(JSON.parse(fs.readFileSync(bf, 'utf8')));
  const build = probes.map((p) => ({
    host: p.host, group: 'build',
    what: 'National elections layer source — ' + (p.publisher || p.pack) + (p.reads ? ' (' + p.reads + ')' : ''),
    whatJp: '国政選挙レイヤーの元データ — ' + (p.publisher || p.pack),
  }));
  return Object.assign({}, ledger, { hosts: (ledger.hosts || []).concat(build) });
}

/* ══ (ops-next) the history ═══════════════════════════════════════════════════════════════════════
   HISTORY_KEEP — how many measured nights the bundle carries.
   ⚠ (no-ad-hoc-hardcoding §4) observed: upstream-liveness.yml keeps its artifact 90 days
   (`retention-days: 90`), so 90 is what a backfill can ever reach, and at one check a day a quarter of a
   year (≈ 113 hosts × 90 characters ≈ 10 kB in the bundle). Expires: if the schedule runs more than once
   a day, 90 nights stop being a quarter — the page states the span from `nights`, never from this number.
   Canon: this constant; js/service-status.js reads the span from the bundle. */
export const HISTORY_KEEP = 90;
export const VERDICT_CHAR = Object.freeze({ alive: 'a', refused: 'r', dead: 'd', unobserved: 'u' });
const NOT_PROBED = '.';

/**
 * The history with one more measurement folded in — pure. A measurement already held (same measuredAt)
 * or older than the newest held night changes nothing: the history only moves forward, and the same
 * input twice is the same history (.agents/rules/one-pass-or-a-reason.md — idempotent).
 * @param {{ keep, nights: string[], hosts: { [host]: string } } | null} prev
 * @param {{ measuredAt, networkObserved, hosts: { host, verdict }[] } | null} upstream
 */
export function advanceHistory(prev, upstream, keep = HISTORY_KEEP) {
  const base = prev && Array.isArray(prev.nights) && prev.hosts && typeof prev.hosts === 'object'
    ? { nights: prev.nights.slice(), hosts: Object.assign({}, prev.hosts) } : { nights: [], hosts: {} };
  const at = upstream && upstream.measuredAt;
  const newest = base.nights[base.nights.length - 1];
  if (!at || !Array.isArray(upstream.hosts) || (newest && Date.parse(at) <= Date.parse(newest))) return { keep, ...base };
  const n = base.nights.length;
  const tonight = new Map(upstream.hosts.map((h) => [h.host, upstream.networkObserved === false ? 'u' : (VERDICT_CHAR[h.verdict] || 'u')]));
  /* a host first probed tonight was not probed on the nights before — never «alive» by default */
  for (const h of tonight.keys()) if (!(h in base.hosts)) base.hosts[h] = NOT_PROBED.repeat(n);
  for (const h of Object.keys(base.hosts)) base.hosts[h] = base.hosts[h] + (tonight.get(h) || NOT_PROBED);
  base.nights.push(at);
  const cut = Math.max(0, base.nights.length - keep);
  if (cut) {
    base.nights = base.nights.slice(cut);
    for (const h of Object.keys(base.hosts)) base.hosts[h] = base.hosts[h].slice(cut);
  }
  /* a host probed on none of the nights still held has left the ledger — it leaves the history too */
  for (const h of Object.keys(base.hosts)) if (!/[^.]/.test(base.hosts[h])) delete base.hosts[h];
  const hosts = {};
  for (const h of Object.keys(base.hosts).sort()) hosts[h] = base.hosts[h];
  return { keep, nights: base.nights, hosts };
}

/**
 * (ops-next) what the status page is told about the half of the Atlas evaluation that needs no session
 * (scripts/atlas-eval.mjs --offline, uploaded by atlas-eval.yml's `offline` job as atlas-eval-offline) — the
 * counts only; the per-question table stays on the run page. null when the report is not one.
 */
export function offlineSummary(rep, run) {
  if (!rep || rep.schema !== 'intmap-atlas-eval-offline/1' || !rep.replay || !rep.reach) return null;
  return {
    at: rep.at || (run && run.at) || null, runId: run ? run.id : null,
    replay: { cassettes: rep.replay.cassettes, clean: rep.replay.clean },
    reach: { basis: rep.reach.basis, questions: rep.reach.questions, allFound: rep.reach.allFound, pairs: rep.reach.pairs, reached: rep.reach.reached },
  };
}
function offlineOf(repo, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intmap-atlas-offline-'));
  try {
    ghJSON(['run', 'download', String(run.id), '--repo', repo, '--name', OFFLINE_REPORT, '--dir', dir], { cwd: ROOT, timeoutMs: 60000 });
    const f = path.join(dir, 'atlas-eval-offline.json');
    return fs.existsSync(f) ? offlineSummary(JSON.parse(fs.readFileSync(f, 'utf8')), run) : null;
  } catch { return null; } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } }
}

/** the bundle, from the two inputs — pure, so a test can build one without a network */
export function compose({ liveness, ledger, atlasEval, unread, now, previousHistory }) {
  const at = (now || new Date()).toISOString();
  const upstream = readerUpstreams(liveness, ledger);
  /* the in-band record first, so check:datagov's head read finds it (scripts/data-governance.mjs bundleRecord) */
  return {
    ...TERMS,
    generatedAt: at,
    retrievedAt: at,
    /* the moment the bundle speaks for: the newest measurement in it */
    asOf: [upstream && upstream.measuredAt, atlasEval && atlasEval.latest && atlasEval.latest.at].filter(Boolean).sort().pop() || at,
    quality: measureQuality(upstream ? upstream.hosts : [], { fields: { host: {}, verdict: {} }, key: ['host'] }),
    v: 1,
    builtAt: at,
    upstream,
    atlasEval: atlasEval || null,
    unread: unread && unread.length ? unread : [],
    /* (ops-next) every measured night carried forward — see advanceHistory */
    history: advanceHistory(previousHistory || null, upstream),
  };
}

const sameSaying = (a, b) => {
  const strip = (o) => { const c = Object.assign({}, o); delete c.builtAt; delete c.generatedAt; delete c.retrievedAt; return JSON.stringify(c); };
  return strip(a) === strip(b);
};

async function main() {
  const ledger = readerLedger(ROOT);
  const unread = [];
  const repo = process.env.GITHUB_REPOSITORY || ghRepo({ cwd: ROOT, timeoutMs: 15000 });
  let liveness = null;
  const lp = arg('--liveness');
  if (lp) {
    try { liveness = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch (e) { unread.push({ half: 'upstream', why: 'the given result is not readable: ' + e.message }); }
  } else if (repo) {
    const got = latestLiveness(repo);
    liveness = got.result; if (!liveness) unread.push({ half: 'upstream', why: got.why });
  } else unread.push({ half: 'upstream', why: 'no repository to read (gh missing or not logged in)' });
  const atlasEval = repo ? fetchAtlasEval(repo, { cwd: ROOT, timeoutMs: 20000 }) : null;
  if (!atlasEval) unread.push({ half: 'atlasEval', why: repo ? 'the runs of atlas-eval.yml could not be read' : 'no repository to read' });
  /* (ops-next) the half that needs no session, when a run uploaded it — else null, and the page says nothing about it */
  if (atlasEval) atlasEval.offline = atlasEval.offlineRun ? offlineOf(repo, atlasEval.offlineRun) : null;

  const file = path.join(ROOT, arg('--out') || OUT);
  let prev = null; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { prev = null; }
  /* (ops-next) the history carried forward: last time's, and — with --backfill — every older night GitHub
     still keeps, folded in oldest first (advanceHistory passes over a night it already holds) */
  let previousHistory = prev && prev.history ? prev.history : null;
  if (has('--backfill') && repo && !lp) {
    for (const r of olderLiveness(repo)) previousHistory = advanceHistory(previousHistory, readerUpstreams(r, ledger));
  }
  const out = compose({ liveness, ledger, atlasEval, unread, previousHistory });
  if (has('--print')) { console.log(JSON.stringify(out, null, 2)); return; }
  if (prev && sameSaying(prev, out)) { console.log(`${OUT}: nothing new since ${prev.builtAt} — left as it was`); return; }
  /* ⚠ A RUN THAT READ NOTHING DOES NOT OVERWRITE A BUNDLE THAT READ SOMETHING — the halves it could not
     read keep last time's answer, which still carries its own measuredAt / its own run dates. */
  if (prev) {
    if (!out.upstream && prev.upstream) out.upstream = prev.upstream;
    if (!out.atlasEval && prev.atlasEval) out.atlasEval = prev.atlasEval;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  const u = out.upstream;
  console.log(`${OUT}: history ${out.history.nights.length} night(s) · upstream ${u ? `${u.measuredAt} · ${u.hosts.filter((h) => h.verdict !== 'alive').length} not alive of ${u.hosts.length}` : 'unread'}`
    + ` · atlas eval ${out.atlasEval ? (out.atlasEval.lastSuccessAt ? 'last success ' + out.atlasEval.lastSuccessAt : 'never succeeded in ' + out.atlasEval.total + ' run(s)') : 'unread'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
