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
 *  Run:
 *    node scripts/build-service-status.mjs                       read both through gh, write the bundle
 *    node scripts/build-service-status.mjs --liveness r.json     use this upstream-liveness result
 *    node scripts/build-service-status.mjs --print               print, write nothing
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readerUpstreams, fetchAtlasEval, ghJSON, ghRepo } from './lib/nightly-status.mjs';
import { measureQuality } from '../js/data-governance.js';

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

/** the newest completed upstream-liveness result, downloaded through gh into a temporary directory */
function latestLiveness(repo) {
  const runs = ghJSON(['run', 'list', '--repo', repo, '--workflow', 'upstream-liveness.yml', '--status', 'completed',
    '--limit', '10', '--json', 'databaseId,conclusion,createdAt'], { cwd: ROOT, timeoutMs: 20000 });
  if (!Array.isArray(runs)) return { result: null, why: 'gh could not list the upstream-liveness runs' };
  const run = runs.find((r) => r.conclusion === 'success' || r.conclusion === 'failure');
  if (!run) return { result: null, why: 'no completed upstream-liveness run' };
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

/** the bundle, from the two inputs — pure, so a test can build one without a network */
export function compose({ liveness, ledger, atlasEval, unread, now }) {
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
  };
}

const sameSaying = (a, b) => {
  const strip = (o) => { const c = Object.assign({}, o); delete c.builtAt; delete c.generatedAt; delete c.retrievedAt; return JSON.stringify(c); };
  return strip(a) === strip(b);
};

async function main() {
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, LEDGER), 'utf8'));
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

  const out = compose({ liveness, ledger, atlasEval, unread });
  if (has('--print')) { console.log(JSON.stringify(out, null, 2)); return; }
  const file = path.join(ROOT, arg('--out') || OUT);
  let prev = null; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { prev = null; }
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
  console.log(`${OUT}: upstream ${u ? `${u.measuredAt} · ${u.hosts.filter((h) => h.verdict !== 'alive').length} not alive of ${u.hosts.length}` : 'unread'}`
    + ` · atlas eval ${out.atlasEval ? (out.atlasEval.lastSuccessAt ? 'last success ' + out.atlasEval.lastSuccessAt : 'never succeeded in ' + out.atlasEval.total + ' run(s)') : 'unread'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
